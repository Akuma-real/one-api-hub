import type { WebDAVConfig, WebDAVResult } from "../types"
import { accountStorage } from "./accountStorage"
import { userPreferences } from "./userPreferences"

class WebDAVService {
  private config: WebDAVConfig | null = null

  // 获取 WebDAV 配置
  async getConfig(): Promise<WebDAVConfig> {
    if (this.config) return this.config

    const result = await chrome.storage.local.get(['webdav_config'])
    this.config = result.webdav_config || {
      enabled: false,
      server_url: '',
      username: '',
      password: '',
      backup_path: '/webdav',
      auto_sync_on_change: false,
      last_backup_time: 0
    }
    return this.config
  }

  // 保存 WebDAV 配置
  async saveConfig(config: WebDAVConfig): Promise<boolean> {
    try {
      await chrome.storage.local.set({ webdav_config: config })
      this.config = config
      return true
    } catch (error) {
      console.error('保存 WebDAV 配置失败:', error)
      return false
    }
  }

  // 规范化 URL 路径
  private normalizePath(url: string, path: string): string {
    const baseUrl = url.replace(/\/$/, '')
    const normalizedPath = path.startsWith('/') ? path : '/' + path
    const finalPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/'
    return baseUrl + finalPath
  }

  // 创建通用请求头
  private createHeaders(config: WebDAVConfig, contentType?: string): HeadersInit {
    const headers: HeadersInit = {
      'Authorization': `Basic ${btoa(`${config.username}:${config.password}`)}`,
      'User-Agent': 'OneAPIHub-WebDAV-Client/1.0',
      'Accept': '*/*'
    }
    
    if (contentType) {
      headers['Content-Type'] = contentType
    }
    
    return headers
  }

  // 发送 WebDAV 请求（处理 CORS）
  private async sendWebDAVRequest(url: string, options: RequestInit): Promise<Response> {
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 在 Chrome 扩展中，我们可以使用 background script 来避免 CORS 问题
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          return await new Promise((resolve, reject) => {
            // 检查 runtime 是否有效
            if (!chrome.runtime?.id) {
              reject(new Error('扩展运行时无效，可能正在重新加载'))
              return
            }

            const timeoutId = setTimeout(() => {
              reject(new Error('请求超时'))
            }, 30000) // 30秒超时

            chrome.runtime.sendMessage({
              action: 'webdavRequest',
              url,
              options
            }, (response) => {
              clearTimeout(timeoutId)
              
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message || '扩展通信失败'
                // 如果是连接错误，可能是扩展正在重新加载
                if (errorMsg.includes('Receiving end does not exist')) {
                  reject(new Error('扩展后台脚本暂时不可用，请稍后重试'))
                } else {
                  reject(new Error(errorMsg))
                }
                return
              }
              
              if (!response) {
                reject(new Error('未收到响应'))
                return
              }
              
              if (!response.success) {
                reject(new Error(response.message || '请求失败'))
                return
              }
              
              // 创建一个模拟的 Response 对象
              const responseData = response.data
              const mockResponse = {
                ok: responseData.ok,
                status: responseData.status,
                statusText: responseData.statusText,
                headers: new Headers(responseData.headers || {}),
                text: () => Promise.resolve(responseData.text || ''),
                json: () => {
                  try {
                    return Promise.resolve(JSON.parse(responseData.text || '{}'))
                  } catch (e) {
                    return Promise.reject(new Error('JSON 解析失败'))
                  }
                }
              }
              resolve(mockResponse as Response)
            })
          })
        } else {
          // 直接使用 fetch（可能受 CORS 限制）
          return await fetch(url, options)
        }
      } catch (error) {
        lastError = error as Error
        console.error(`[WebDAV] 请求失败 (尝试 ${attempt}/${maxRetries}):`, error)
        
        // 如果是连接问题且还有重试机会，等待后重试
        if (attempt < maxRetries && error.message.includes('扩展后台脚本暂时不可用')) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // 递增延迟
          continue
        }
        
        // 如果不是连接问题或已达到最大重试次数，直接抛出错误
        throw error
      }
    }

    throw lastError || new Error('WebDAV 请求失败')
  }

  // 检查目录是否存在
  private async checkDirectoryExists(config: WebDAVConfig, dirPath: string): Promise<boolean> {
    try {
      const url = this.normalizePath(config.server_url, dirPath)
      const response = await this.sendWebDAVRequest(url, {
        method: 'PROPFIND',
        headers: {
          ...this.createHeaders(config, 'application/xml'),
          'Depth': '0'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype/>
  </prop>
</propfind>`
      })
      
      return response.ok
    } catch (error) {
      console.error('检查目录失败:', error)
      return false
    }
  }

  // 创建目录
  private async createDirectory(config: WebDAVConfig, dirPath: string): Promise<boolean> {
    try {
      const url = this.normalizePath(config.server_url, dirPath)
      const response = await this.sendWebDAVRequest(url, {
        method: 'MKCOL',
        headers: this.createHeaders(config)
      })
      
      return response.ok || response.status === 405 // 405 表示目录已存在
    } catch (error) {
      console.error('创建目录失败:', error)
      return false
    }
  }

  // 确保目录存在
  private async ensureDirectoryExists(config: WebDAVConfig, dirPath: string): Promise<boolean> {
    const exists = await this.checkDirectoryExists(config, dirPath)
    if (exists) return true
    
    // 递归创建父目录
    const pathParts = dirPath.split('/').filter(part => part.length > 0)
    let currentPath = ''
    
    for (const part of pathParts) {
      currentPath += '/' + part
      const partExists = await this.checkDirectoryExists(config, currentPath)
      if (!partExists) {
        const created = await this.createDirectory(config, currentPath)
        if (!created) return false
      }
    }
    
    return true
  }

  // 测试 WebDAV 连接
  async testConnection(): Promise<WebDAVResult> {
    const config = await this.getConfig()
    
    if (!config.enabled || !config.server_url || !config.username) {
      return {
        success: false,
        message: '请先完成 WebDAV 配置'
      }
    }

    try {
      const response = await this.sendWebDAVRequest(config.server_url, {
        method: 'PROPFIND',
        headers: {
          ...this.createHeaders(config, 'application/xml'),
          'Depth': '0'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <resourcetype/>
  </prop>
</propfind>`
      })

      if (response.ok) {
        return {
          success: true,
          message: 'WebDAV 连接测试成功'
        }
      } else {
        return {
          success: false,
          message: `连接失败: ${response.status} ${response.statusText}`
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `连接错误: ${error.message}`
      }
    }
  }

  // 记录同步日志
  private async addSyncLog(trigger: string, success: boolean, message: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['webdav_sync_logs'])
      const logs = result.webdav_sync_logs || []
      
      const newLog = {
        timestamp: Date.now(),
        trigger,
        success,
        message
      }
      
      // 保留最近50条记录
      logs.push(newLog)
      if (logs.length > 50) {
        logs.splice(0, logs.length - 50)
      }
      
      await chrome.storage.local.set({ webdav_sync_logs: logs })
    } catch (error) {
      console.error('记录同步日志失败:', error)
    }
  }

  // 上传备份到 WebDAV
  async uploadBackup(trigger: string = '手动备份'): Promise<WebDAVResult> {
    const config = await this.getConfig()
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'WebDAV 备份未启用'
      }
    }

    try {
      // 确保备份目录存在
      const dirCreated = await this.ensureDirectoryExists(config, config.backup_path)
      if (!dirCreated) {
        return {
          success: false,
          message: '无法创建备份目录'
        }
      }

      // 获取要备份的数据
      const [accountData, preferencesData] = await Promise.all([
        accountStorage.exportData(),
        userPreferences.exportPreferences()
      ])

      const backupData = {
        version: "1.0",
        timestamp: Date.now(),
        accounts: accountData,
        preferences: preferencesData
      }

      // 生成统一的时间戳，确保文件名和最后备份时间一致
      const backupTimestamp = Date.now()
      const now = new Date(backupTimestamp)
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hour = String(now.getHours()).padStart(2, '0')
      const minute = String(now.getMinutes()).padStart(2, '0')
      const second = String(now.getSeconds()).padStart(2, '0')
      const filename = `backup-${year}-${month}-${day}_${hour}-${minute}-${second}.json`
      const uploadUrl = this.normalizePath(config.server_url, config.backup_path) + filename

      const response = await this.sendWebDAVRequest(uploadUrl, {
        method: 'PUT',
        headers: this.createHeaders(config, 'application/json'),
        body: JSON.stringify(backupData, null, 2)
      })

      if (response.ok) {
        // 使用相同的时间戳更新最后备份时间
        config.last_backup_time = backupTimestamp
        await this.saveConfig(config)
        
        const successMessage = `备份上传成功: ${filename}`
        
        // 记录成功日志
        await this.addSyncLog(trigger, true, successMessage)
        
        return {
          success: true,
          message: successMessage
        }
      } else {
        // 提供更详细的错误信息
        let errorMessage = `上传失败: ${response.status}`
        
        switch (response.status) {
          case 401:
            errorMessage += ' - 认证失败，请检查用户名和密码'
            break
          case 403:
            errorMessage += ' - 权限不足，请检查账号权限'
            break
          case 404:
            errorMessage += ' - 路径不存在，请检查服务器地址和备份路径'
            break
          case 423:
            errorMessage += ' - 资源被锁定，文件可能正在被使用或服务器繁忙，请稍后重试'
            break
          case 507:
            errorMessage += ' - 存储空间不足'
            break
          case 500:
            errorMessage += ' - 服务器内部错误'
            break
          case 502:
            errorMessage += ' - 网关错误，服务器暂时不可用'
            break
          case 503:
            errorMessage += ' - 服务不可用，服务器暂时过载'
            break
          default:
            if (response.statusText) {
              errorMessage += ` - ${response.statusText}`
            }
        }
        
        // 记录失败日志
        await this.addSyncLog(trigger, false, errorMessage)
        
        return {
          success: false,
          message: errorMessage
        }
      }
    } catch (error) {
      const errorMessage = `上传错误: ${error.message}`
      
      // 记录异常日志
      await this.addSyncLog(trigger, false, errorMessage)
      
      return {
        success: false,
        message: errorMessage
      }
    }
  }

  // 从 WebDAV 下载备份
  async downloadBackup(filename: string): Promise<WebDAVResult> {
    const config = await this.getConfig()
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'WebDAV 备份未启用'
      }
    }

    try {
      const downloadUrl = this.normalizePath(config.server_url, config.backup_path) + filename
      
      const response = await this.sendWebDAVRequest(downloadUrl, {
        method: 'GET',
        headers: this.createHeaders(config)
      })

      if (response.ok) {
        const backupData = await response.json()
        
        return {
          success: true,
          message: '备份下载成功',
          data: backupData
        }
      } else {
        return {
          success: false,
          message: `下载失败: ${response.status} ${response.statusText}`
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `下载错误: ${error.message}`
      }
    }
  }

  // 获取备份文件列表
  async getBackupList(): Promise<WebDAVResult> {
    const config = await this.getConfig()
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'WebDAV 备份未启用',
        files: []
      }
    }

    try {
      const listUrl = this.normalizePath(config.server_url, config.backup_path)
      
      const response = await this.sendWebDAVRequest(listUrl, {
        method: 'PROPFIND',
        headers: {
          ...this.createHeaders(config, 'application/xml'),
          'Depth': '1'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <resourcetype/>
    <getcontentlength/>
    <getlastmodified/>
  </prop>
</propfind>`
      })

      if (response.ok) {
        const xmlText = await response.text()
        const files = this.parseWebDAVResponse(xmlText)
        
        return {
          success: true,
          message: '获取备份列表成功',
          files: files.filter(f => f.endsWith('.json')).sort().reverse()
        }
      } else {
        return {
          success: false,
          message: `获取列表失败: ${response.status} ${response.statusText}`,
          files: []
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `获取列表错误: ${error.message}`,
        files: []
      }
    }
  }

  // 改进的 WebDAV PROPFIND 响应解析
  private parseWebDAVResponse(xmlText: string): string[] {
    try {
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
      const files: string[] = []

      // 尝试多种可能的元素名称和命名空间
      const possibleResponseTags = ['response', 'd:response', 'D:response']
      const possibleHrefTags = ['href', 'd:href', 'D:href']
      const possibleDisplayNameTags = ['displayname', 'd:displayname', 'D:displayname']

      let responses: HTMLCollectionOf<Element> | null = null
      
      // 查找 response 元素
      for (const tag of possibleResponseTags) {
        responses = xmlDoc.getElementsByTagName(tag)
        if (responses.length > 0) break
      }

      if (!responses || responses.length === 0) {
        console.warn('未找到 response 元素')
        return []
      }

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i]
        let filename = ''

        // 尝试从 displayname 获取文件名
        for (const tag of possibleDisplayNameTags) {
          const displayNameElement = response.getElementsByTagName(tag)[0]
          if (displayNameElement?.textContent) {
            filename = displayNameElement.textContent.trim()
            break
          }
        }

        // 如果没有 displayname，从 href 提取文件名
        if (!filename) {
          for (const tag of possibleHrefTags) {
            const hrefElement = response.getElementsByTagName(tag)[0]
            if (hrefElement?.textContent) {
              const href = hrefElement.textContent.trim()
              filename = decodeURIComponent(href.split('/').pop() || '')
              break
            }
          }
        }

        // 检查是否为文件（不是目录）
        if (filename && filename !== '' && !filename.endsWith('/')) {
          // 检查是否为目录（通过 resourcetype）
          const resourceTypeElements = response.getElementsByTagName('resourcetype')
          let isDirectory = false
          
          if (resourceTypeElements.length > 0) {
            const resourceType = resourceTypeElements[0]
            const collectionElements = resourceType.getElementsByTagName('collection')
            isDirectory = collectionElements.length > 0
          }

          if (!isDirectory) {
            files.push(filename)
          }
        }
      }

      return files
    } catch (error) {
      console.error('解析 WebDAV 响应失败:', error)
      console.error('XML 内容:', xmlText)
      return []
    }
  }

  // 删除备份文件
  async deleteBackup(filename: string): Promise<WebDAVResult> {
    const config = await this.getConfig()
    
    if (!config.enabled) {
      return {
        success: false,
        message: 'WebDAV 备份未启用'
      }
    }

    try {
      const deleteUrl = this.normalizePath(config.server_url, config.backup_path) + filename
      
      const response = await this.sendWebDAVRequest(deleteUrl, {
        method: 'DELETE',
        headers: this.createHeaders(config)
      })

      if (response.ok) {
        return {
          success: true,
          message: `备份文件删除成功: ${filename}`
        }
      } else {
        return {
          success: false,
          message: `删除失败: ${response.status} ${response.statusText}`
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `删除错误: ${error.message}`
      }
    }
  }

  // 数据变动时自动同步到WebDAV
  async syncOnDataChange(trigger: string = '数据变动'): Promise<void> {
    try {
      const config = await this.getConfig()
      
      // 检查是否启用了数据变动同步
      if (!config.enabled || !config.auto_sync_on_change) {
        return
      }

      console.log(`[WebDAV] ${trigger}，开始自动同步`)
      
      // 使用 await 确保同步操作完成并正确记录日志
      try {
        const result = await this.uploadBackup(trigger)
        if (result.success) {
          console.log(`[WebDAV] ${trigger}同步成功:`, result.message)
        } else {
          console.error(`[WebDAV] ${trigger}同步失败:`, result.message)
        }
      } catch (error) {
        const errorMessage = error.message || '未知错误'
        console.error(`[WebDAV] ${trigger}同步异常:`, errorMessage)
        
        // 记录异常日志
        await this.addSyncLog(trigger, false, `同步异常: ${errorMessage}`)
      }
    } catch (error) {
      const errorMessage = error.message || '未知错误'
      console.error(`[WebDAV] ${trigger}同步检查失败:`, errorMessage)
      
      // 记录检查失败日志
      try {
        await this.addSyncLog(trigger, false, `同步检查失败: ${errorMessage}`)
      } catch (logError) {
        console.error('[WebDAV] 记录同步日志失败:', logError)
      }
    }
  }
}

export const webdavService = new WebDAVService()