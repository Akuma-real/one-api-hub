  import { useState } from "react"
import { 
  CloudIcon,
  Cog6ToothIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
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
    backup_path: '/backups/one-api-hub/',
    auto_backup: false,
    backup_interval: 24,
    last_backup_time: 0
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [backupFiles, setBackupFiles] = useState<string[]>([])
  const [showPassword, setShowPassword] = useState(false)

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

  // 立即备份
  const handleBackup = async () => {
    try {
      setIsLoading(true)
      const result = await webdavService.uploadBackup()
      if (result.success) {
        toast.success(result.message)
        loadBackupFiles()
        loadConfig() // 重新加载配置以更新最后备份时间
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

  // 初始加载
  if (!config.server_url && !isLoading) {
    loadConfig()
  }

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 配置设置 */}
        <section>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <Cog6ToothIcon className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-medium text-gray-900">服务器配置</h2>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
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
                  placeholder="/backups/one-api-hub/"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">备份文件在服务器上的存储路径</p>
              </div>

              {/* 自动备份设置 */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">自动备份</label>
                    <p className="text-xs text-gray-500">定期自动备份数据到云端</p>
                  </div>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, auto_backup: !prev.auto_backup }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      config.auto_backup ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.auto_backup ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {config.auto_backup && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      备份间隔（小时）
                    </label>
                    <select
                      value={config.backup_interval}
                      onChange={(e) => setConfig(prev => ({ ...prev, backup_interval: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={1}>每小时</option>
                      <option value={6}>每6小时</option>
                      <option value={12}>每12小时</option>
                      <option value={24}>每天</option>
                      <option value={168}>每周</option>
                    </select>
                  </div>
                )}
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
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
            
            <div className="p-6">
              {!config.enabled ? (
                <div className="text-center py-8">
                  <CloudIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">请先启用并配置 WebDAV 服务器</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 最后备份时间 */}
                  {config.last_backup_time && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-800">
                          最后备份时间: {formatFullTime(new Date(config.last_backup_time))}
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
                                    const parts = filename.split('backup-')[1]?.split('-');
                                    if (parts && parts.length >= 4) {
                                      // 格式: backup-YYYY-MM-DD-timestamp.json
                                      const date = parts.slice(0, 3).join('-'); // YYYY-MM-DD
                                      const timestamp = parseInt(parts[3]?.split('.')[0] || '0');
                                      if (timestamp > 0) {
                                        return `备份时间: ${formatFullTime(new Date(timestamp))}`;
                                      } else {
                                        return `备份日期: ${date}`;
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

      {/* 使用说明 */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-blue-800 font-medium mb-2">使用说明</p>
            <ul className="text-blue-700 space-y-1">
              <li>• 支持标准的 WebDAV 协议服务器（如 Nextcloud、ownCloud 等）</li>
              <li>• 备份文件包含所有账号数据和用户设置</li>
              <li>• 自动备份功能会在后台定期执行，无需手动操作</li>
              <li>• 恢复备份会覆盖当前所有数据，请谨慎操作</li>
              <li>• 建议定期检查备份文件的完整性</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}