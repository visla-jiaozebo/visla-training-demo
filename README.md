# 卡布奇诺 · 交互编辑演示

在线页面：https://visla-jiaozebo.github.io/visla-training-demo/?v=cappuccino-vo-v1

8 个 Scene、3 道示例题，支持问题和答案编辑、分支、Scene 跳转、保存预览及 SCORM 1.2 导出。

## B-roll + VO

每个 Scene 展示 `brolls[0]`，同时播放 `voiceOvers[0]` 对应的原始旁白。VO 跟随视频播放、暂停、拖动及倍速；切换 Scene、答题和退出时停止。旁白有独立静音按钮。

原 PJSON 的旁白为一条连续 MP3，各 Scene 引用不同裁剪区间。原签名链接已失效，因此读取原 S3 音频，按区间切出 8 个 MP3，保存在 `cappuccino/audio/`。这些文件随页面托管，也随 SCORM 导出打包。没有重新生成或替换旁白内容。

完整 PJSON 的原字段、账户标识、视频及签名资源链接仍保留；`training.voiceOver` 增加稳定的音频路径和裁剪信息。视频仍使用原 Getty 预览 URL，未复制到 GitHub。

这是单个 B-roll 加单段 VO 的演示，不支持多 B-roll 合成、A-roll、BGM 或完整 PJSON 时间线。浏览器可能要求先点击视频播放按钮才能启用声音。草稿只存在各自浏览器。
