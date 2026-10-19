# 墨息

数字毛笔页面保留在 `index.html`。每周交互研发固定保存在本仓库的 **`codex/weekly-prototypes` 分支**，不要求用户逐轮批准或接收建议。

## 开始运行

Node.js 22 或以上，无第三方依赖，无需安装包。

```sh
npm test
npm run experiment
npm run serve
```

打开 `http://127.0.0.1:8765`，选择安静或活跃历史，再观察相同输入下两侧反馈的差别。原始数字毛笔主页没有改动。

- [实验索引](experiments/index.json)：机制、状态、去重依据与下一步。
- [001 墨迹记忆](experiments/001-memory/README.md)：假设、最小实验、指标、风险及迭代判断。
- [结果](experiments/001-memory/results/report.json)：由实际执行生成；不能把合成输入检查当作真人或设备验收。
- [TouchDesigner / MediaPipe / AIGC 接口](integrations/README.md)。

## 周度执行约定

每次读取 `AGENTS.md`、实验索引和上一轮结果，选择一个可验证机制，直接修改代码、执行可运行的实验、保存证据并提交推送。不用聊天建议替代实现。没有现场设备时推进合成回放、消融、接口、离线学习与可重复基准，记录实测边界；不无限等待用户反馈。

所有结果留在 GitHub，成功运行不主动发消息。只有仓库权限失效、需要用户凭据/设备操作等阻断时才通知。凭据和原始人像、音频不入库。后续每个结果必须准确区分手工状态、学习潜空间和动作条件预测模型。
