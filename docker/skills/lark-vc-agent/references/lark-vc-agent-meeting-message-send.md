
# lark_vc_meeting_message_send

(authentication is handled automatically by the MCP server)

发送会中文本消息或会中 reaction emoji。该工具是**写操作**，必须沿用 `meeting_id` 的来源身份：通过 MCP server 时身份始终是用户身份，因此应使用用户身份发现的 `meeting_id`，且当前用户必须正在该会议中。

本工具对应 shortcut：`lark_vc_meeting_message_send`（调用 `POST /open-apis/vc/v1/bots/message`）。

## 适用场景

- 用户要求"在会里发一句话""提示大家""给当前会议发消息"。
- 用户要求发送会中表情，例如"发个点赞""发个 OK""发个爱心"。
- 用户要求表达会中反馈，例如"听不到""看不到""声音清楚""效果不错"。
- 只用于正在进行中的会议；已结束会议不支持。

## 身份规则

`meeting_id` 从哪种身份路径拿到，发送消息时就沿用哪种身份。通过 MCP server 时身份始终是用户身份：

| meeting_id 来源 | 发送时身份 |
| --- | --- |
| 用户身份的 `lark_vc_meeting_list_active`（不带 `user_id`） | 用户身份发送（MCP server 可用） |
| ⚠️ 应用身份 `lark_vc_meeting_list_active`（带 `user_id`） | 应用身份发送（MCP server 不可用） |
| ⚠️ 应用机器人入会返回的 `meeting.id` | 应用身份发送（MCP server 不可用） |

不要把用户身份发现的 `meeting_id` 改用应用身份发送。通过 MCP server 时用用户身份发现的 `meeting_id` 继续用用户身份发送。

## 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `meeting_id` | 是 | 长数字 `meeting_id`，不是 9 位会议号 |
| `msg_type` | 否 | `text` 或 `reaction`；只传 `text` 或只传 `emoji_type` 时可自动推断 |
| `text` | 否 | 文本消息内容 |
| `emoji_type` | 否 | 会中 reaction emoji key，大小写敏感，必须从本文"完整 `emoji_type` 列表"中选择 |
| `uuid` | 否 | 幂等 key；不传则服务端生成 |

工具会把 `text` 或 `emoji_type` 统一映射到 OpenAPI 请求体的 `content` 字段；`meeting_id` 也在请求体中传递。

## 文本消息

```
lark_vc_meeting_message_send(meeting_id="<meeting_id>", text="稍等，我在看文档")
```

文本消息会出现在会议内的文本互动区。不要把它当成绑定群消息发送能力；如果用户明确要求发到群聊，路由到 `lark_get_skill(domain="im")`。

## 会中表情

会中 reaction 支持普通 Feishu reaction emoji，也支持 4 个 VC 反馈 key。

常见语义：

| 用户表达 | 推荐 `emoji_type` |
| --- | --- |
| 点赞、赞一下、认可 | `THUMBSUP` |
| +1、加一、附议、同上 | `JIAYI` |
| OK、好的 | `OK` |
| 收到、了解 | `Get` |
| 爱心、红心 | `HEART` |
| 喜欢、爱了 | `LOVE` |
| 比心 | `FINGERHEART` |
| 看起来没问题、可以继续 | `LGTM` |
| 搞定、已完成 | `DONE` |
| -1、减一 | `MinusOne` |
| 不赞同、踩 | `ThumbsDown` |
| 听不到、没声音 | `VC_NoSound` |
| 看不到、画面有问题 | `VC_CanNotSee` |
| 声音清楚 | `VC_SoundsClear` |
| 会议画面效果不错、画面看起来可以 | `VC_LooksGood` |

```
lark_vc_meeting_message_send(meeting_id="<meeting_id>", msg_type="reaction", emoji_type="LOVE")
lark_vc_meeting_message_send(meeting_id="<meeting_id>", msg_type="reaction", emoji_type="VC_NoSound")
```

不要编造列表外的 `emoji_type`，也不要把 mixed-case 值改成全大写，例如 `EatingFood`、`CheckMark`、`StatusInFlight` 都要按原值传。

如果用户给的是自然语言语义，可以在下方列表中选择语义最接近的 key；如果不确定，先向用户确认。

### 完整 `emoji_type` 列表

以下列表与 IM reaction 官方 emoji 列表保持一致，并额外包含 VC 会中特定反馈 key：

```text
OK, THUMBSUP, THANKS, MUSCLE, FINGERHEART, APPLAUSE, FISTBUMP, JIAYI
DONE, SMILE, BLUSH, LAUGH, SMIRK, LOL, FACEPALM, LOVE
WINK, PROUD, WITTY, SMART, SCOWL, THINKING, SOB, CRY
ERROR, NOSEPICK, HAUGHTY, SLAP, SPITBLOOD, TOASTED, GLANCE, DULL
INNOCENTSMILE, JOYFUL, WOW, TRICK, YEAH, ENOUGH, TEARS, EMBARRASSED
KISS, SMOOCH, DROOL, OBSESSED, MONEY, TEASE, SHOWOFF, COMFORT
CLAP, PRAISE, STRIVE, XBLUSH, SILENT, WAVE, WHAT, FROWN
SHY, DIZZY, LOOKDOWN, CHUCKLE, WAIL, CRAZY, WHIMPER, HUG
BLUBBER, WRONGED, HUSKY, SHHH, SMUG, ANGRY, HAMMER, SHOCKED
TERROR, PETRIFIED, SKULL, SWEAT, SPEECHLESS, SLEEP, DROWSY, YAWN
SICK, PUKE, BETRAYED, HEADSET, EatingFood, MeMeMe, Sigh, Typing
Lemon, Get, LGTM, OnIt, OneSecond, VRHeadset, YouAreTheBest, SALUTE
SHAKE, HIGHFIVE, UPPERLEFT, ThumbsDown, SLIGHT, TONGUE, EYESCLOSED, RoarForYou
CALF, BEAR, BULL, RAINBOWPUKE, ROSE, HEART, PARTY, LIPS
BEER, CAKE, GIFT, CUCUMBER, Drumstick, Pepper, CANDIEDHAWS, BubbleTea
Coffee, Yes, No, OKR, CheckMark, CrossMark, MinusOne, Hundred
AWESOMEN, Pin, Alarm, Loudspeaker, Trophy, Fire, BOMB, Music
XmasTree, Snowman, XmasHat, FIREWORKS, 2022, REDPACKET, FORTUNE, LUCK
FIRECRACKER, StickyRiceBalls, HEARTBROKEN, POOP, StatusFlashOfInspiration, 18X, CLEAVER, Soccer
Basketball, GeneralDoNotDisturb, Status_PrivateMessage, GeneralInMeetingBusy, StatusReading, StatusInFlight, GeneralBusinessTrip, GeneralWorkFromHome
StatusEnjoyLife, GeneralTravellingCar, StatusBus, GeneralSun, GeneralMoonRest, MoonRabbit, Mooncake, JubilantRabbit
TV, Movie, Pumpkin, BeamingFace, Delighted, ColdSweat, FullMoonFace, Partying
GoGoGo, ThanksFace, SaluteFace, Shrug, ClownFace, HappyDragon
VC_CanNotSee, VC_NoSound, VC_LooksGood, VC_SoundsClear
```

## 9 位会议号处理

如果用户给的是 9 位会议号并要求发送会中消息：

1. 先用用户身份执行 `lark_vc_meeting_list_active`。
2. 在返回结果中按 `meeting_no` 匹配该 9 位会议号。
3. 匹配到唯一会议后取长数字 `meeting_id`。
4. 用发现该会议时的同一身份（MCP server 上即用户身份）执行 `lark_vc_meeting_message_send`。

匹配失败时不要尝试入会（入会是应用身份写操作，MCP 不可用）。

## 权限和前置条件

- 用户身份（MCP server 可用）：当前用户必须正在该会议中。
- ⚠️ 应用身份（MCP server 不可用）：应用机器人必须正在该会议中，且应用已安装、数据范围已配置。
- 会议需要开启会中智能体/Agent 能力开关。
- 需要 `vc:meeting.message:write` 权限。

用户身份报权限或身份不支持类错误时，按主 skill 的"用户身份被拒绝时"处理；如果错误表明该链路只能用应用身份，说明该能力在 MCP server 上不可用，不要反复重试。

## 相关

- `lark_get_skill(domain="vc-agent", section="meeting-list-active")` — 发现当前进行中会议 ID
- `lark_get_skill(domain="vc-agent", section="meeting-events")` — 读取会中事件
- `lark_get_skill(domain="vc-agent", section="meeting-join")` — ⚠️ 应用机器人入会（MCP server 不可用）
