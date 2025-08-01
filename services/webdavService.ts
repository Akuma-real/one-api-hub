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
      backup_path: '/backups/one-api-hub/',
      auto_backup: false,
      backup_interval: 24,
      last_backup_time: 0
    }
    return this.config
  }

  // 保存 WebDAV 配置
  async saveConfig(config: WebDAVConfig): Promise<boolean> {
    try {
      await chrome.storage.local.set({ webdav_config: config })
      this.config = config
      
      // 通知后台脚本配置已更新
      try {
        chrome.runtime.sendMessage({ action: 'webdavConfigUpdate' })
      } catch (error) {
        // 忽略消息发送失败
      }
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
    try {
      // 在 Chrome 扩展中，我们可以使用 background script 来避免 CORS 问题
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'webdavRequest',
            url,
            options
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || '扩展通信失败'))
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
      console.error('[WebDAV] 请求发送失败:', error)
      throw new Error(`WebDAV 请求失败: ${error.message}`)
    }
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

  // 上传备份到 WebDAV
  async uploadBackup(): Promise<WebDAVResult> {
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

      const filename = `backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`
      const uploadUrl = this.normalizePath(config.server_url, config.backup_path) + filename

      const response = await this.sendWebDAVRequest(uploadUrl, {
        method: 'PUT',
        headers: this.createHeaders(config, 'application/json'),
        body: JSON.stringify(backupData, null, 2)
      })

      if (response.ok) {
        // 更新最后备份时间
        config.last_backup_time = Date.now()
        await this.saveConfig(config)
        
        return {
          success: true,
          message: `备份上传成功: ${filename}`
        }
      } else {
        return {
          success: false,
          message: `上传失败: ${response.status} ${response.statusText}`
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `上传错误: ${error.message}`
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
}

export const webdavService = new WebDAVService()