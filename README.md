# WebFormAutoFiller

Chrome 扩展（Manifest V3），用于按配置自动填充网页表单。支持字段录制、按类型渲染填写控件、Element Plus / Ant Design 等常见 UI 组件，以及诊断日志导出。

**当前版本：v1.3**

## 功能特性

### 表单填充

- 一键填充当前页面表单
- 支持文本、数字、日期、单选、下拉、多选、复选框等控件
- 兼容 Element Plus、Ant Design 等组件库（单选组、下拉、日期选择器、日期范围）
- 定位策略：标签 XPath 优先，CSS / 绝对 XPath 作为备用

### 配置与数据

- 表单模板（字段映射配置）的导入、导出、删除
- 填写记录的保存、导入、导出、删除
- 数据存储在 `chrome.storage.local`，无需手动维护本地文件

### 页面录制（v1.3）

- 在目标页面点击表单字段，自动生成定位器与字段类型
- 自动识别单选、多选、下拉、日期等控件，并采集选项列表
- 支持在已有配置上追加字段

### 智能填写界面（v1.3）

- Popup 根据字段类型渲染对应控件（单选按钮、下拉框、日期输入等）
- 打开 Popup 时从页面实时读取选项，与配置合并显示
- 填充结果按字段汇总成功 / 失败原因

### 诊断日志（v1.3）

- 点击「诊断」生成并复制完整调试报告
- 包含页面探测、字段匹配步骤、选项采集、上次填充结果等
- 字段识别异常时可发给开发者排查

### 配置解析工具

- 从 MHTML 文件解析表单结构
- 可视化预览与元素点选
- 生成 XPath 与 JSON 配置

## 安装

```bash
git clone https://github.com/n66g4/WebFormAutoFiller.git
cd WebFormAutoFiller
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目目录
4. 点击工具栏图标即可使用

## 使用指南

### 基本流程

1. 打开目标网页（表单页面）
2. 点击扩展图标，选择「表单模板」
3. 在「填写内容」区域输入或选择各字段值
4. 点击「开始填充」

可选：点击「保存」将当前填写内容存为记录，下次快速载入。

### 录制配置

适用于 Element Plus 等动态页面，比 MHTML 解析更准确。

1. 打开目标表单页面
2. 在 Popup 中点击「录制配置」
3. 依次点击页面上的表单字段（单选组、下拉、日期等会自动识别整组控件）
4. 点击「完成」保存配置
5. 可在 Popup 中导出 JSON 备份

### 诊断

当某字段填充失败或 Popup 控件类型不对时：

1. 保持目标页面打开
2. 在 Popup「填写内容」区域点击「诊断」
3. 日志会自动复制到剪贴板
4. 将日志发给开发者或自行对照 `probedMeta`、`lastFillResult` 排查

### 配置解析工具

1. 在 Popup 中点击「打开配置解析工具」
2. 上传 MHTML 文件并解析
3. 点选需要映射的表单元素
4. 生成并下载 JSON 配置

## 项目结构

```
WebFormAutoFiller/
├── manifest.json           # 扩展清单（v1.3）
├── popup.html / popup.js   # 主界面：填充、录制、诊断
├── config-parser.html/js   # MHTML 配置解析工具
├── background.js           # 后台消息与录制状态
├── styles.css
├── configs-index.json      # 内置配置索引（首次安装迁移用）
├── content/
│   ├── recorder.js         # 页面录制器
│   └── recorder.css
├── shared/
│   ├── fill-engine.js      # 页面填充引擎
│   ├── field-type.js       # 字段类型检测与选项采集
│   ├── locator.js          # 定位器生成与解析
│   ├── diagnostics.js      # 诊断报告
│   ├── storage.js          # Chrome Storage 封装
│   ├── dom-label.js        # 标签文本处理
│   ├── field-key.js        # 字段键生成
│   └── xpath.js            # XPath 工具
└── icon*.png
```

## 配置文件格式

### 完整示例

```json
{
  "id": "new-config",
  "name": "登记业务",
  "description": "企业登记相关表单",
  "mappings": {
    "DH": "移动电话",
    "LRLX": "代理人类型",
    "FIELD3": "代表或接受委托的有效期限",
    "FIELD4": "领取执照方式",
    "MC": "是否通过名称申办流水号引入"
  },
  "fieldMeta": {
    "DH": { "type": "text", "options": [] },
    "LRLX": {
      "type": "radio",
      "options": ["登记代理人", "登记联络员", "投资人"]
    },
    "FIELD3": { "type": "date", "options": [] },
    "FIELD4": {
      "type": "select",
      "options": ["窗口领取"]
    },
    "MC": {
      "type": "radio",
      "options": ["是", "否"]
    }
  },
  "fieldMappings": {
    "移动电话": {
      "labelText": "移动电话",
      "strategy": "label-xpath",
      "primary": "//div[contains(@class,\"el-form-item\")][.//*[contains(@class,\"el-form-item__label\") and contains(normalize-space(.), '移动电话')]]//input[not(@type=\"hidden\")][1]",
      "fallback": "input[placeholder=\"请输入内容\"]"
    },
    "代理人类型": {
      "labelText": "代理人类型",
      "strategy": "label-xpath",
      "primary": "//div[contains(@class,\"el-form-item\")][.//*[contains(@class,\"el-form-item__label\") and contains(normalize-space(.), '代理人类型')]]//div[contains(@class,\"el-radio-group\")][1]",
      "fallback": "/html/body/.../div[contains(@class,\"el-radio-group\")]"
    }
  }
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 配置唯一标识 |
| `name` | 显示名称 |
| `description` | 配置描述（可选） |
| `mappings` | 字段键 → 中文标签（Popup 显示与填充映射） |
| `fieldMeta` | 字段类型与选项（`text` / `textarea` / `number` / `date` / `radio` / `select` / `multiselect` / `checkbox`） |
| `fieldMappings` | 中文标签 → 定位器（字符串 XPath/CSS，或带 `primary` / `fallback` / `strategy` 的对象） |

定位器 `strategy` 常用值：

- `label-xpath`：按表单项标签匹配，适合 Element Plus 等动态 ID 页面
- `xpath` / `css`：直接路径定位

## 开发说明

### 技术栈

- Manifest V3
- Chrome Storage / Scripting API
- 纯 JavaScript，无构建步骤

### 本地校验

修改代码后可做语法检查：

```bash
node --check shared/field-type.js
node --check shared/fill-engine.js
node --check popup.js
node --check content/recorder.js
```

### 权限

| 权限 | 用途 |
|------|------|
| `activeTab` | 访问当前标签页 |
| `scripting` | 注入填充与探测脚本 |
| `storage` | 持久化配置与填写记录 |

## 更新日志

### v1.3

- 新增页面录制器，点击字段自动生成配置
- 新增共享填充引擎，支持 Element Plus 单选、下拉、日期范围
- Popup 按字段类型渲染控件，并从页面实时读取选项
- 新增诊断日志导出
- 定位器支持标签 XPath + 备用选择器
- 修复单选选项文字误读、短标签误匹配、日期字段误判等问题

### v1.1

- 配置与填写记录的导入 / 导出 / 删除
- 内置 MHTML 配置解析工具
- 使用 Chrome Storage 存储数据
- 移除 CSV/Excel 与文件系统依赖

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
