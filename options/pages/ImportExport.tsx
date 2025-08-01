import { useState } from "react"
import { 
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CloudIcon
} from "@heroicons/react/24/outline"
import { accountStorage } from "../../services/accountStorage"
import { userPreferences } from "../../services/userPreferences"
import { webdavService } from "../../services/webdavService"
import type { WebDAVConfig } from "../../types"
import toast from 'react-hot-toast'

export default function ImportExport() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importData, setImportData] = useState("")

  // 生成统一的备份文件名格式（与WebDAV保持一致）
  const generateBackupFilename = (prefix: string = 'backup') => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    
    return `${prefix}-${year}-${month}-${day}_${hours}-${minutes}-${seconds}.json`
  }

  // WebDAV 快速备份
  const handleWebdavBackup = async () => {
    try {
      const config = await webdavService.getConfig()
      
      if (!config?.enabled) {
        toast.error('请先在 WebDAV 备份页面配置并启用云备份功能')
        return
      }

      const result = await webdavService.uploadBackup()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('WebDAV 备份失败:', error)
      toast.error('WebDAV 备份失败')
    }
  }

  // 导出所有数据
  const handleExportAll = async () => {
    try {
      setIsExporting(true)
      
      // 获取账号数据和用户偏好设置
      const [accountData, preferencesData] = await Promise.all([
        accountStorage.exportData(),
        userPreferences.exportPreferences()
      ])

      const exportData = {
        version: "1.0",
        timestamp: Date.now(),
        accounts: accountData,
        preferences: preferencesData
      }

      // 创建下载链接
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = generateBackupFilename('one-api-Hub-backup')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('数据导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      toast.error('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  // 导出账号数据
  const handleExportAccounts = async () => {
    try {
      setIsExporting(true)
      
      const accountData = await accountStorage.exportData()
      const exportData = {
        version: "1.0",
        timestamp: Date.now(),
        type: "accounts",
        data: accountData
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = generateBackupFilename('accounts-backup')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('账号数据导出成功')
    } catch (error) {
      console.error('导出账号数据失败:', error)
      toast.error('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  // 导出用户设置
  const handleExportPreferences = async () => {
    try {
      setIsExporting(true)
      
      const preferencesData = await userPreferences.exportPreferences()
      const exportData = {
        version: "1.0",
        timestamp: Date.now(),
        type: "preferences",
        data: preferencesData
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = generateBackupFilename('preferences-backup')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('用户设置导出成功')
    } catch (error) {
      console.error('导出用户设置失败:', error)
      toast.error('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  // 处理文件导入
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportData(content)
    }
    reader.readAsText(file)
  }

  // 导入数据
  const handleImport = async () => {
    if (!importData.trim()) {
      toast.error('请选择要导入的文件或输入数据')
      return
    }

    try {
      setIsImporting(true)
      
      const data = JSON.parse(importData)
      
      // 验证数据格式
      if (!data.version || !data.timestamp) {
        throw new Error('数据格式不正确')
      }

      let importSuccess = false

      // 根据数据类型进行导入
      if (data.accounts || !data.type) {
        // 导入账号数据
        const accountsData = data.accounts || data.data
        if (accountsData) {
          const success = await accountStorage.importData(accountsData)
          if (success) {
            importSuccess = true
            toast.success('账号数据导入成功')
          }
        }
      }

      if (data.preferences || data.type === "preferences") {
        // 导入用户设置
        const preferencesData = data.preferences || data.data
        if (preferencesData) {
          const success = await userPreferences.importPreferences(preferencesData)
          if (success) {
            importSuccess = true
            toast.success('用户设置导入成功')
          }
        }
      }

      if (!importSuccess) {
        throw new Error('没有找到可导入的数据')
      }

      // 清空输入框
      setImportData("")
      
    } catch (error) {
      console.error('导入失败:', error)
      if (error instanceof SyntaxError) {
        toast.error('数据格式错误，请检查JSON格式')
      } else {
        toast.error(`导入失败: ${error.message}`)
      }
    } finally {
      setIsImporting(false)
    }
  }

  // 验证导入数据
  const validateImportData = () => {
    if (!importData.trim()) return null
    
    try {
      const data = JSON.parse(importData)
      return {
        valid: true,
        hasAccounts: !!(data.accounts || (data.type !== "preferences" && data.data)),
        hasPreferences: !!(data.preferences || data.type === "preferences"),
        timestamp: data.timestamp ? new Date(data.timestamp).toLocaleString('zh-CN') : '未知'
      }
    } catch {
      return { valid: false }
    }
  }

  const validation = validateImportData()

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <ArrowPathIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">导入/导出</h1>
        </div>
        <p className="text-gray-500">备份和恢复插件数据</p>
      </div>

      {/* WebDAV 云备份快捷操作 */}
      <WebDAVQuickActions onBackup={handleWebdavBackup} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 导出数据 */}
        <section>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <ArrowUpTrayIcon className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-medium text-gray-900">导出数据</h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">将数据导出为JSON文件进行备份</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* 导出所有数据 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">完整备份</h3>
                    <p className="text-sm text-gray-500">
                      导出所有账号数据和用户设置，推荐用于完整备份
                    </p>
                  </div>
                  <button
                    onClick={handleExportAll}
                    disabled={isExporting}
                    className="ml-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                  >
                    {isExporting ? '导出中...' : '导出'}
                  </button>
                </div>
              </div>

              {/* 导出账号数据 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">账号数据</h3>
                    <p className="text-sm text-gray-500">
                      仅导出账号信息和相关数据
                    </p>
                  </div>
                  <button
                    onClick={handleExportAccounts}
                    disabled={isExporting}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                  >
                    {isExporting ? '导出中...' : '导出'}
                  </button>
                </div>
              </div>

              {/* 导出用户设置 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-1">用户设置</h3>
                    <p className="text-sm text-gray-500">
                      仅导出界面设置和偏好配置
                    </p>
                  </div>
                  <button
                    onClick={handleExportPreferences}
                    disabled={isExporting}
                    className="ml-4 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                  >
                    {isExporting ? '导出中...' : '导出'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 导入数据 */}
        <section>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <ArrowDownTrayIcon className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-medium text-gray-900">导入数据</h2>
              </div>
              <p className="text-sm text-gray-500 mt-1">从备份文件恢复数据</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* 文件选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择备份文件
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileImport}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <DocumentIcon className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              {/* 数据预览 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  数据内容预览
                </label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder="粘贴JSON数据或通过上面的文件选择器导入..."
                  className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 数据验证结果 */}
              {validation && (
                <div className={`p-3 rounded-lg ${
                  validation.valid 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-start space-x-2">
                    {validation.valid ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="text-sm">
                      {validation.valid ? (
                        <div>
                          <p className="text-green-800 font-medium">数据格式正确</p>
                          <div className="mt-1 text-green-700">
                            {validation.hasAccounts && <p>• 包含账号数据</p>}
                            {validation.hasPreferences && <p>• 包含用户设置</p>}
                            <p>• 备份时间: {validation.timestamp}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-red-800">数据格式错误，请检查JSON格式</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 导入按钮 */}
              <button
                onClick={handleImport}
                disabled={isImporting || !validation?.valid}
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? '导入中...' : '导入数据'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 重要提示 */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-yellow-800 font-medium mb-1">重要提示</p>
            <ul className="text-yellow-700 space-y-1">
              <li>• 导入数据将覆盖现有的相同类型数据，请谨慎操作</li>
              <li>• 建议在导入前先导出当前数据进行备份</li>
              <li>• 仅支持本插件导出的JSON格式文件</li>
              <li>• 导入的账号数据包含敏感信息，请确保文件来源可信</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// WebDAV 快捷操作组件
function WebDAVQuickActions({ onBackup }: { onBackup: () => void }) {
  const [config, setConfig] = useState<WebDAVConfig | null>(null)
  const [loaded, setLoaded] = useState(false)

  const checkAndLoadConfig = async () => {
    if (loaded) return config
    
    try {
      const webdavConfig = await webdavService.getConfig()
      setConfig(webdavConfig)
      setLoaded(true)
      return webdavConfig
    } catch (error) {
      console.error('加载 WebDAV 配置失败:', error)
      setLoaded(true)
      return null
    }
  }

  // 如果还没有加载配置，先加载
  if (!loaded) {
    checkAndLoadConfig()
    return null // 加载中不显示任何内容
  }

  // 如果 WebDAV 未启用，不显示快捷操作
  if (!config?.enabled) {
    return null
  }

  return (
    <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CloudIcon className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-medium text-gray-900">WebDAV 云备份</h3>
            <p className="text-sm text-gray-500">
              已启用云备份功能，可以快速备份到云端或前往详细管理页面
            </p>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={onBackup}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            立即云备份
          </button>
          <button
            onClick={() => window.location.hash = '#webdav-backup'}
            className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            管理云备份
          </button>
        </div>
      </div>
    </div>
  )
}