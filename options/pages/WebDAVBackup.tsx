import { useState, useEffect } from "react"
import { 
  CloudIcon,
  Cog6ToothIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ClockIcon
} from "@heroicons/react/24/outline"
import { webdavService } from "../../services/webdavService"
import type { WebDAVConfig, WebDAVResult } from "../../types"
import { formatFullTime } from "../../utils/formatters"
import toast from 'react-hot-toast'

export default function WebDAVBackup() {
  const [config, setConfig] = useState<WebDAVConfig>({
    enabled: false,
    server_url: '',
    username: '',
    password: '',
    backup_path: '/webdav',
    auto_sync_on_change: false,
    last_backup_time: 0
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [backupFiles, setBackupFiles] = useState<string[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [syncLogs, setSyncLogs] = useState<Array<{
    timestamp: number
    trigger: string
    success: boolean
    message: string
  }>>([])

  // 加载配置
  const loadConfig = async () => {
    try {
      const savedConfig = await webdavService.getConfig()
      setConfig(savedConfig)
      if (savedConfig.enabled) {
        loadBackupFiles()
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    }
  }

  // 保存配置
  const saveConfig = async () => {
    try {
      setIsLoading(true)
      const success = await webdavService.saveConfig(config)
      if (success) {
        toast.success('配置保存成功')
        if (config.enabled) {
          loadBackupFiles()
        }
      } else {
        toast.error('配置保存失败')
      }
    } catch (error) {
      console.error('保存配置失败:', error)
      toast.error('保存配置失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 测试连接
  const testConnection = async () => {
    try {
      setIsTesting(true)
      const result = await webdavService.testConnection()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('测试连接失败:', error)
      toast.error('测试连接失败')
    } finally {
      setIsTesting(false)
    }
  }

  // 加载备份文件列表
  const loadBackupFiles = async () => {
    try {
      const result = await webdavService.getBackupList()
      if (result.success && result.files) {
        setBackupFiles(result.files)
      }
    } catch (error) {
      console.error('加载备份文件失败:', error)
    }
  }

  // 加载同步日志
  const loadSyncLogs = async () => {
    try {
      const result = await chrome.storage.local.get(['webdav_sync_logs'])
      const logs = result.webdav_sync_logs || []
      setSyncLogs(logs.slice(-20)) // 只显示最近20条记录
    } catch (error) {
      console.error('加载同步日志失败:', error)
    }
  }

  // 立即备份
  const handleBackup = async () => {
    try {
      setIsLoading(true)
      const result = await webdavService.uploadBackup('手动备份')
      if (result.success) {
        toast.success(result.message)
        loadBackupFiles()
        loadConfig() // 重新加载配置以更新最后备份时间
        loadSyncLogs() // 重新加载日志
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('备份失败:', error)
      toast.error('备份失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 恢复备份
  const handleRestore = async (filename: string) => {
    if (!confirm(`确定要从备份文件 "${filename}" 恢复数据吗？这将覆盖当前所有数据。`)) {
      return
    }

    try {
      setIsLoading(true)
      const result = await webdavService.downloadBackup(filename)
      if (result.success && result.data) {
        // 导入账号数据和用户设置
        const { accountStorage } = await import("../../services/accountStorage")
        const { userPreferences } = await import("../../services/userPreferences")
        
        const backupData = result.data
        
        // 恢复账号数据
        if (backupData.accounts) {
          await accountStorage.importData(backupData.accounts)
        }
        
        // 恢复用户设置
        if (backupData.preferences) {
          await userPreferences.importPreferences(backupData.preferences)
        }
        
        toast.success('备份恢复成功，请刷新页面查看最新数据')
        
        // 延迟刷新页面以确保数据保存完成
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        toast.error(result.message || '下载备份文件失败')
      }
    } catch (error) {
      console.error('恢复备份失败:', error)
      toast.error(`恢复备份失败: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // 删除备份
  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`确定要删除备份文件 "${filename}" 吗？`)) {
      return
    }

    try {
      const result = await webdavService.deleteBackup(filename)
      if (result.success) {
        toast.success(result.message)
        loadBackupFiles()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('删除备份失败:', error)
      toast.error('删除备份失败')
    }
  }

  // 使用useEffect来正确加载配置
  useEffect(() => {
    loadConfig()
    loadSyncLogs()

    // 监听存储变化，当其他页面更新配置时自动刷新
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.webdav_config) {
        console.log('检测到WebDAV配置变化，重新加载配置')
        loadConfig()
      }
      if (areaName === 'local' && changes.webdav_sync_logs) {
        console.log('检测到同步日志变化，重新加载日志')
        loadSyncLogs()
      }
    }

    // 监听页面可见性变化，当页面重新可见时刷新配置
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('页面重新可见，刷新WebDAV配置')
        loadConfig()
        loadSyncLogs()
      }
    }

    // 监听窗口焦点变化
    const handleFocus = () => {
      console.log('窗口获得焦点，刷新WebDAV配置')
      loadConfig()
      loadSyncLogs()
    }

    // 添加事件监听器
    chrome.storage.onChanged.addListener(handleStorageChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // 清理函数
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <CloudIcon className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">WebDAV 云备份</h1>
        </div>
        <p className="text-gray-500">配置 WebDAV 服务器，自动备份插件数据到云端</p>
      </div>

      <div className="space-y-8">
        {/* 上半部分：配置设置和备份管理 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* 配置设置 */}
          <section>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden h-full flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <Cog6ToothIcon className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-medium text-gray-900">服务器配置</h2>
            </div>
          </div>
          
          <div className="p-6 space-y-4 flex-1">
              {/* 启用开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">启用 WebDAV 备份</label>
                  <p className="text-xs text-gray-500">开启后可以使用云备份功能</p>
                </div>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.enabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* 服务器地址 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  服务器地址
                </label>
                <input
                  type="url"
                  value={config.server_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, server_url: e.target.value }))}
                  placeholder="https://your-webdav-server.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 用户名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  value={config.username}
                  onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="输入用户名"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 密码 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={config.password}
                    onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="输入密码"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm text-gray-600 hover:text-gray-800"
                  >
                    {showPassword ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>

              {/* 备份路径 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备份路径
                </label>
                <input
                  type="text"
                  value={config.backup_path}
                  onChange={(e) => setConfig(prev => ({ ...prev, backup_path: e.target.value }))}
                  placeholder="/webdav"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">备份文件在服务器上的存储路径</p>
              </div>

              {/* 数据变动同步设置 */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">数据变动同步</label>
                    <p className="text-xs text-gray-500">当账号数据发生变化时自动同步到云端</p>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, auto_sync_on_change: !prev.auto_sync_on_change }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      config.auto_sync_on_change ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.auto_sync_on_change ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={testConnection}
                  disabled={isTesting || !config.server_url || !config.username}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                >
                  {isTesting ? '测试中...' : '测试连接'}
                </button>
                <button
                  onClick={saveConfig}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                >
                  {isLoading ? '保存中...' : '保存配置'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 备份管理 */}
        <section>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden h-full flex flex-col">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ArrowUpTrayIcon className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-medium text-gray-900">备份管理</h2>
              </div>
              {config.enabled && (
                <button
                  onClick={handleBackup}
                  disabled={isLoading}
                  className="px-3 py-1 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
                >
                  {isLoading ? '备份中...' : '立即备份'}
                </button>
              )}
            </div>
          </div>
          
          <div className="p-6 flex-1 flex flex-col">
            {!config.enabled ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <CloudIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">请先启用并配置 WebDAV 服务器</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col">
                  {/* 最后备份时间 */}
                  {config.last_backup_time > 0 ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-800">
                          最后备份时间: {formatFullTime(new Date(config.last_backup_time))}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
                        <span className="text-sm text-yellow-800">
                          尚未进行过备份
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 备份文件列表 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-700">云端备份文件</h3>
                      <button
                        onClick={loadBackupFiles}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        刷新列表
                      </button>
                    </div>
                    
                    {backupFiles.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        暂无备份文件
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {backupFiles.map((filename) => (
                          <div key={filename} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {filename}
                              </p>
                              <p className="text-xs text-gray-500">
                                {(() => {
                                  if (filename.includes('backup-')) {
                                    // 支持新格式: backup-YYYY-MM-DD_HH-mm-ss.json
                                    const timeStr = filename.split('backup-')[1]?.replace('.json', '');
                                    if (timeStr) {
                                      try {
                                        // 将格式转换为标准ISO格式
                                        // backup-2024-01-15_14-30-25.json -> 2024-01-15T14:30:25
                                        const isoStr = timeStr.replace('_', 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
                                        const date = new Date(isoStr);
                                        if (!isNaN(date.getTime())) {
                                          return `备份时间: ${formatFullTime(date)}`;
                                        }
                                      } catch (e) {
                                        console.error('解析备份文件时间失败:', e);
                                      }
                                    }
                                  }
                                  return '备份文件';
                                })()}
                              </p>
                            </div>
                            <div className="flex space-x-2 ml-3">
                              <button
                                onClick={() => handleRestore(filename)}
                                className="p-1 text-blue-600 hover:text-blue-800"
                                title="恢复备份"
                              >
                                <ArrowDownTrayIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteBackup(filename)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="删除备份"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

        {/* 下半部分：同步日志 */}
        <section>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ClockIcon className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-medium text-gray-900">同步日志</h2>
                  <span className="text-xs text-gray-500">({syncLogs.length} 条记录)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={loadSyncLogs}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    刷新日志
                  </button>
                  {syncLogs.length > 0 && (
                    <button
                      onClick={async () => {
                        if (confirm('确定要清除所有同步日志吗？')) {
                          try {
                            await chrome.storage.local.set({ webdav_sync_logs: [] })
                            setSyncLogs([])
                            toast.success('同步日志已清除')
                          } catch (error) {
                            console.error('清除日志失败:', error)
                            toast.error('清除日志失败')
                          }
                        }
                      }}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      清除日志
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-6">
              {!config.enabled || !config.auto_sync_on_change ? (
                <div className="text-center py-8">
                  <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {!config.enabled ? '请先启用 WebDAV 备份' : '请启用数据变动同步功能'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {syncLogs.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 text-sm">
                      暂无同步日志
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {syncLogs.map((log, index) => (
                        <div key={index} className={`p-3 border rounded-lg ${
                          log.success 
                            ? 'border-green-200 bg-green-50' 
                            : 'border-red-200 bg-red-50'
                        }`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                {log.success ? (
                                  <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                                ) : (
                                  <ExclamationTriangleIcon className="w-4 h-4 text-red-600 flex-shrink-0" />
                                )}
                                <span className={`text-sm font-medium ${
                                  log.success ? 'text-green-800' : 'text-red-800'
                                }`}>
                                  {log.trigger}
                                </span>
                                {!log.success && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    失败
                                  </span>
                                )}
                              </div>
                              <div className={`text-xs ${
                                log.success ? 'text-green-700' : 'text-red-700'
                              }`}>
                                <p className="break-words">{log.message}</p>
                                {!log.success && log.message.includes('423') && (
                                  <p className="mt-1 text-red-600 font-medium">
                                    💡 错误码 423: 资源被锁定，可能是文件正在被其他进程使用或服务器配置问题
                                  </p>
                                )}
                                {!log.success && log.message.includes('扩展后台脚本暂时不可用') && (
                                  <p className="mt-1 text-red-600 font-medium">
                                    💡 扩展通信错误，请尝试刷新页面或重新加载扩展
                                  </p>
                                )}
                                {!log.success && log.message.includes('无法创建备份目录') && (
                                  <p className="mt-1 text-red-600 font-medium">
                                    💡 目录创建失败，请检查WebDAV服务器权限和路径配置
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                              <span className={`text-xs ${
                                log.success ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatFullTime(new Date(log.timestamp))}
                              </span>
                              {log.success && log.message.includes('backup-') && (
                                <span className="text-xs text-gray-500">
                                  ✓ 已上传
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 使用说明 */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-blue-800 font-medium mb-2">使用说明</p>
            <ul className="text-blue-700 space-y-1">
              <li>• 支持标准的 WebDAV 协议服务器（如 Nextcloud、ownCloud 等）</li>
              <li>• 备份文件包含所有账号数据和用户设置</li>
              <li>• 数据变动同步功能会在账号增删改时自动触发备份</li>
              <li>• 同步日志显示最近20条自动备份记录及触发原因</li>
              <li>• 恢复备份会覆盖当前所有数据，请谨慎操作</li>
              <li>• 建议定期检查备份文件的完整性</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}