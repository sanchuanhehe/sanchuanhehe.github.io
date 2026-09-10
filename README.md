# sanchuanhehe.github.io

GitHub 账号主页与统一项目入口。域名： https://github.sanchuanhehe.com

- `/`：项目导航。
- `/mermaid-gantt-studio/`：浏览器端 Mermaid 编辑器的公开静态版本，使用通用示例；完整工程仓库保持私有。

本仓库直接从 main 根目录发布，`.nojekyll` 禁用 Jekyll。域名 CNAME 只保留在本账号主页仓库，其他项目使用仓库子路径。

编辑器更新时，从私有工程复制 `editor/dist` 到 `mermaid-gantt-studio`，然后使用通用 `example.mmd` 并清理 index.html/app.mjs 中的私有计划备注，再检查发布。不要复制私有项目的测试、历史、示例图或内部排期。

旧 ESP32 看板已按要求停用，不再保留网站或数据入口，data 仓库源码仍保留。
