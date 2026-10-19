# 接口与接入边界

## TouchDesigner

运行 `npm run experiment` 后运行 `npm run osc`。脚本按 30 Hz 目标节奏发送 OSC float 消息到 `127.0.0.1:7400`，三个地址为 `/moxi/energy`、`/moxi/turbulence`、`/moxi/saturation`，取值 [0,1]。每次是三个独立消息，非原子帧，正式同步需求留待后续。

在 TouchDesigner 创建 **OSC In CHOP**，设置 UDP、Network Port 7400、本地地址 127.0.0.1。用 Null CHOP 保留输入，再用 Select/Math CHOP 映射选中通道到笔触半径、Noise TOP 幅度和 Level TOP 不透明度。CHOP 通道名以实际收到的地址转换为准。最小显示可以先观察三个输入通道，不依赖既有 `.toe` 文件。

本地 UDP 测试验证字节编码与收发；尚未运行 TouchDesigner，因此不能标记现场接入完成。设备不可用时保留回放和浏览器反馈，不等待或伪造验收。

## MediaPipe

`src/pose-adapter.mjs` 接收 Web PoseLandmarkerResult 的 `landmarks`、上一帧归一化手腕及帧间隔：

```js
const value = poseToXin(result, previous, dtSeconds);
previous = value.previous;
if (value.valid) {
  engine.step({ qi: calibratedBreathOrManual, xin: value.xin, sheng: calibratedAudioOrManual }, dtSeconds);
}
```

肩与腕最低 visibility 0.7；肩宽太小、遮挡、首帧时返回 `valid:false`，交由采集器暂停/重新校准。坐标先减肩中心、再除肩宽，计算相对手腕速度的指数衰减作为稳定度。阈值未经人体数据校准。接口只测动作稳定，不能识别“心”。Python 的 `pose_landmarks` 必须先显式转换为 Web 的 `landmarks` 形状，不能直接混用。当前没有下载 MediaPipe 包、模型或开启相机。

## AIGC

`conditioning(state)` 生成 `moxi-conditioning-v1` JSON：显式状态、固定 seed 17、固定提示词与有限强度参数。现阶段的 `execution` 固定为 `conditioning_only_no_model_called`。尚无指定可用模型或接口，本轮不调用付费服务、不假定模型遵从此通用协议。将来适配真实模型时需要验证参数支持、固定种子复现、状态到生成图的可控性和延迟。
