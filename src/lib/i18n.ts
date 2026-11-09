// UI language. Strings are written in Traditional Chinese in the code and
// looked up here for Simplified Chinese and English; a missing entry falls
// back to the Traditional text. `{name}` placeholders are filled from `vars`.

export type Lang = 'zh-Hant' | 'zh-Hans' | 'en'
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: 'zh-Hant', label: '繁體中文', short: '繁' },
  { id: 'zh-Hans', label: '简体中文', short: '简' },
  { id: 'en', label: 'English', short: 'EN' },
]

// The browser's preference, for visitors who haven't picked one.
export function browserLang(): Lang {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of prefs) {
    const l = raw.toLowerCase()
    if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans'
    if (l.startsWith('en')) return 'en'
  }
  return 'en'
}

let current: Lang = 'zh-Hant'
export const getLang = () => current
export function setLang(l: Lang) {
  current = l
  document.documentElement.lang = l
}

export function t(s: string, vars?: Record<string, string | number>): string {
  const out = current === 'zh-Hant' ? s : (DICT[current][s] ?? s)
  return vars ? out.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : out
}

// Locale for dates and numbers.
export const locale = () => (current === 'en' ? 'en-GB' : current === 'zh-Hans' ? 'zh-CN' : 'zh-TW')

type Dict = Record<string, string>
// prettier-ignore
const HANS: Dict = {
  '全部': '全部', '未分組': '未分组', '搜尋名稱／國家／架構': '搜索名称／国家／架构', '載入中…': '加载中…',
  '無法取得節點資料：{error}': '无法获取节点数据：{error}', '沒有資料': '没有数据', '離線': '离线', '在線': '在线',
  '{n} 個地點': '{n} 个地点', '{n} 個國家': '{n} 个国家', '{n} 條鏈路': '{n} 条链路',
  '地球': '地球', '平面': '平面', '暫停轉動': '暂停转动', '開始轉動': '开始转动',
  '隱藏拓撲連線': '隐藏拓扑连线', '顯示拓撲連線': '显示拓扑连线', '拓撲': '拓扑',
  '改回直線連線': '改回直线连线', '依實際路由（AS 路徑）畫出連線': '按实际路由（AS 路径）画出连线', '路由': '路由',
  '放大': '放大', '縮小': '缩小', '重設縮放': '重置缩放', '按住 Ctrl（Mac 為 ⌘）再滾動滑鼠以縮放地圖': '按住 Ctrl（Mac 为 ⌘）再滚动鼠标以缩放地图',
  '路由快照時間（mtr 單向追蹤）': '路由快照时间（mtr 单向追踪）', 'AS 路由': 'AS 路由', '其他 {n} 個網路': '其他 {n} 个网络',
  '海纜示意路線，走哪條為推測': '海缆示意路线，走哪条为推测', '交換點': '交换点',
  '跨海段未對應到海纜，沿海面推估': '跨海段未对应到海缆，沿海面推估', '（推測）': '（推测）',
  '2022 年時規劃中': '2022 年时规划中', '預計 {year}': '预计 {year}', '{year} 年啟用': '{year} 年启用', '等 {n} 家': '等 {n} 家',
  '推測有路由經過': '推测有路由经过', '海纜資料 ©': '海缆数据 ©',
  '服務判定為 {region}': '服务判定为 {region}', '服務判定為 {region}，與節點所在地 {home} 不同': '服务判定为 {region}，与节点所在地 {home} 不同',
  '黃色地區＝與節點所在地不同': '黄色地区＝与节点所在地不同', '檢測中，約一分鐘': '检测中，约一分钟', '送出中…': '提交中…',
  '最近一次檢測': '最近一次检测', '重新檢測': '重新检测', '尚未檢測': '尚未检测', '點擊檢測': '点击检测',
  '流媒體': '流媒体', '流媒體檢測': '流媒体检测', '影音': '影音', '港台日': '港台日', '音樂與社群': '音乐与社交',
  '可用': '可用', '部分可用': '部分可用', '不可用': '不可用', '無法判斷': '无法判断', 'Bilibili 港澳台': 'Bilibili 港澳台',
  '僅自製劇': '仅自制剧', 'IP 被擋': 'IP 被封', '機房 IP 被擋': '机房 IP 被封', '僅限日本': '仅限日本', '僅網頁版': '仅网页版',
  '尚未開放': '尚未开放', '港澳台': '港澳台', '僅台灣': '仅台湾', 'Google 判定為 {cc}': 'Google 判定为 {cc}',
  '無法連線到檢測服務': '无法连接到检测服务', '請先登入後台': '请先登录后台',
  '這台節點沒有在執行檢測程式（未安裝或離線）': '这台节点没有在运行检测程序（未安装或离线）',
  '剛檢測過，請 {n} 分鐘後再試': '刚检测过，请 {n} 分钟后再试', '檢測請求失敗（{status}）': '检测请求失败（{status}）',
  '在地圖上定位': '在地图上定位', '離線 {duration}': '离线 {duration}', 'CPU {n} 核': 'CPU {n} 核', '記憶體': '内存', '硬碟': '硬盘',
  '流量': '流量', '等待資料…': '等待数据…', '節點離線': '节点离线', '超時': '超时',
  '預設': '默认', '網速': '网速', '名稱': '名称', '節點': '节点', '篩選名稱、國家、系統…': '筛选名称、国家、系统…', '排序': '排序',
  '沒有符合的節點': '没有符合的节点', '已連線': '已连接', '輪詢中': '轮询中', '連線中': '连接中', '平均 CPU': '平均 CPU',
  '未知': '未知', '跨海（未對應海纜）': '跨海（未对应海缆）', '追蹤在此中斷，沒有到達 {place}': '追踪在此中断，没有到达 {place}',
  '未到達': '未到达', '{date} 快照': '{date} 快照', '本機': '本机', '{n} 條': '{n} 条', '從本機出發的實際路徑，點一條展開': '从本机出发的实际路径，点击一条展开',
  '返回清單': '返回列表', '系統資訊': '系统信息', '架構': '架构', '系統': '系统', '虛擬化': '虚拟化', '地區': '地区', '核心': '内核',
  '資源': '资源', '延遲': '延迟', '沒有延遲監控': '没有延迟监控', '網路': '网络', '總上傳': '总上传', '總下載': '总下载', '進程': '进程',
  '負載': '负载', '{n} 分鐘': '{n} 分钟', '其他': '其他', '運行時間': '运行时间', '到期': '到期', '節點離線，沒有即時資料': '节点离线，没有实时数据',
  '完整詳情與歷史曲線': '完整详情与历史曲线',
  '顯示設定': '显示设置', '只影響這個瀏覽器，站長的預設值在後台主題設定裡': '只影响这个浏览器，站长的默认值在后台主题设置里',
  '地圖模式': '地图模式', '地球自動旋轉': '地球自动旋转', '拓撲連線': '拓扑连线', '目前沒有可顯示的拓撲': '目前没有可显示的拓扑',
  '真實路由': '真实路由', '連線沿實際的 AS 路徑走': '连线沿实际的 AS 路径走', '需先開啟拓撲連線': '需先开启拓扑连线',
  '點亮有節點的國家': '点亮有节点的国家', '地圖節點標籤': '地图节点标签', '速率': '速率', '名稱+速率': '名称+速率', '關': '关',
  '恢復站長預設': '恢复站长默认', '離開全螢幕': '退出全屏', '全螢幕': '全屏', '已登入：前往後台': '已登录：前往后台', '登入後台': '登录后台',
  '總價值 {amount} / 年': '总价值 {amount} / 年', '未計入（沒有匯率）：{list}': '未计入（没有汇率）：{list}', '{n} 台有標價的伺服器，依計費週期換算成一年': '{n} 台有标价的服务器，按计费周期折算成一年',
  '{n} / {total} 台伺服器在線': '{n} / {total} 台服务器在线', '圖片': '图片', '上一張': '上一张', '換一張': '换一张',
  '玻璃模糊': '玻璃模糊', '不透明度': '不透明度',
  '最近 {n} 小時': '最近 {n} 小时', '最近 {n} 天': '最近 {n} 天', '完整詳情': '完整详情', '關閉': '关闭', '時間範圍': '时间范围', 'CPU 使用率': 'CPU 使用率', '1 / 5 / 15 分鐘': '1 / 5 / 15 分钟', '1 分鐘': '1 分钟', '限額': '限额', '無限額': '无限额', '這台節點沒有延遲監控': '这台节点没有延迟监控', '核心數': '核心数', '在線時間': '在线时间', '備註': '备注', '背景圖片': '背景图片', '自己的圖片': '自己的图片', '站長預設': '站长默认', '處理中…': '处理中…', '上傳圖片': '上传图片', '不用背景': '不用背景', '用站長預設': '用站长默认', '或貼上圖片網址': '或粘贴图片网址', '套用': '应用', '模糊': '模糊', '壓暗': '压暗', '毛玻璃面板': '毛玻璃面板', '上傳的圖片只存在這個瀏覽器，不會傳到伺服器': '上传的图片只存在这个浏览器，不会传到服务器', '資源趨勢': '资源趋势', '網路與流量': '网络与流量', '延遲・丟包': '延迟・丢包', '伺服器資訊': '服务器信息', '請輸入 http(s):// 開頭的圖片網址': '请输入 http(s):// 开头的图片网址', '無法讀取這張圖片': '无法读取这张图片', '圖片太大，瀏覽器存不下，請改用網址': '图片太大，浏览器存不下，请改用网址',
  '展開圖例': '展开图例', '收起圖例': '收起图例', '其他海纜顯示為灰色': '其他海缆显示为灰色', '只有節點路由經過的海纜保留顏色': '只有节点路由经过的海缆保留颜色', '外觀': '外观', '淺色': '浅色', '深色': '深色', '跟隨系統': '跟随系统', '語言': '语言',
  '節點在線': '节点在线', '{n} 個國家／地區': '{n} 个国家／地区', '即時網速': '实时网速', '今日 ↑{up} ↓{down}': '今日 ↑{up} ↓{down}',
  '總覽': '总览', '卡片': '卡片', '表格': '表格',
  '{d} 天 {h} 小時': '{d} 天 {h} 小时', '{h} 小時 {m} 分': '{h} 小时 {m} 分', '{m} 分': '{m} 分', '已過期 {d} 天': '已过期 {d} 天',
  '今天到期': '今天到期', '{d} 天後到期': '{d} 天后到期', '月': '月', '季': '季', '半年': '半年', '年': '年', '兩年': '两年', '三年': '三年',
  '一次性': '一次性', '{n} 個月': '{n} 个月',
  '還沒有延遲資料。到後台「延遲」頁新增監控後，一分鐘內就會出現。': '还没有延迟数据。到后台「延迟」页添加监控后，一分钟内就会出现。',
  '{n} 個節點，近 1 小時': '{n} 个节点，近 1 小时',
  '找不到這個節點，可能已被隱藏或刪除。': '找不到这个节点，可能已被隐藏或删除。', '回總覽': '回总览', '返回': '返回',
  '{n} 核': '{n} 核', '{n} 核，負載 {load}': '{n} 核，负载 {load}', '作業系統': '操作系统', '架構 / 虛擬化': '架构 / 虚拟化', '即時': '实时',
  '上傳 / 下載': '上传 / 下载', '累計流量': '累计流量', '今日流量': '今日流量', '無': '无', '計費': '计费', '價格': '价格',
  '免費 / 未設定': '免费 / 未设置', '流量限額': '流量限额', '本月已用': '本月已用', '歷史': '历史', '讀取歷史失敗：{error}': '读取历史失败：{error}',
  '平均': '平均', '峰值': '峰值', '上傳': '上传', '下載': '下载', '丟包': '丢包', '已用': '已用', '連線數': '连接数',
  '{n} 小時': '{n} 小时', '{n} 天': '{n} 天', '分組': '分组', '本月流量': '本月流量', '近 1 小時': '近 1 小时',
  '重新追蹤': '重新追踪', '追蹤中，約一分鐘': '追踪中，约一分钟', '路由追蹤請求失敗（{status}）': '路由追踪请求失败（{status}）',
  '剛追蹤過，請 {n} 分鐘後再試': '刚追踪过，请 {n} 分钟后再试', '追蹤路由': '追踪路由', '尚未追蹤': '尚未追踪',
  '沒有可以發起追蹤的節點': '没有可以发起追踪的节点',
}
// prettier-ignore
const EN: Dict = {
  '全部': 'All', '未分組': 'Ungrouped', '搜尋名稱／國家／架構': 'Search name, country, arch', '載入中…': 'Loading…',
  '無法取得節點資料：{error}': 'Couldn’t load nodes: {error}', '沒有資料': 'No data', '離線': 'Offline', '在線': 'Online',
  '{n} 個地點': '{n} places', '{n} 個國家': '{n} countries', '{n} 條鏈路': '{n} links',
  '地球': 'Globe', '平面': 'Flat', '暫停轉動': 'Stop spinning', '開始轉動': 'Spin', '隱藏拓撲連線': 'Hide topology links',
  '顯示拓撲連線': 'Show topology links', '拓撲': 'Topology', '改回直線連線': 'Back to straight links',
  '依實際路由（AS 路徑）畫出連線': 'Draw links along the real route (AS path)', '路由': 'Routes',
  '放大': 'Zoom in', '縮小': 'Zoom out', '重設縮放': 'Reset zoom', '按住 Ctrl（Mac 為 ⌘）再滾動滑鼠以縮放地圖': 'Hold Ctrl (⌘ on Mac) and scroll to zoom the map',
  '路由快照時間（mtr 單向追蹤）': 'When the routes were traced (mtr, one direction)', 'AS 路由': 'AS routes', '其他 {n} 個網路': '{n} other networks',
  '海纜示意路線，走哪條為推測': 'Cable lines are schematic; which one a route rides is inferred', '交換點': 'Exchange',
  '跨海段未對應到海纜，沿海面推估': 'No cable matched this crossing; drawn over open water', '（推測）': ' (inferred)',
  '2022 年時規劃中': 'Planned as of 2022', '預計 {year}': 'due {year}', '{year} 年啟用': 'In service since {year}', '等 {n} 家': 'and {n} in all',
  '推測有路由經過': 'A route probably rides this cable', '海纜資料 ©': 'Cable data ©',
  '服務判定為 {region}': 'Service places it in {region}', '服務判定為 {region}，與節點所在地 {home} 不同': 'Service places it in {region}, not {home} where the node is',
  '黃色地區＝與節點所在地不同': 'Amber region = not where the node is', '檢測中，約一分鐘': 'Checking, about a minute', '送出中…': 'Sending…',
  '最近一次檢測': 'Last checked', '重新檢測': 'Check again', '尚未檢測': 'Not checked yet', '點擊檢測': 'Check now',
  '流媒體': 'Streaming', '流媒體檢測': 'Streaming checks', '影音': 'Video', '港台日': 'HK / TW / JP', '音樂與社群': 'Music & social',
  '可用': 'Works', '部分可用': 'Partly', '不可用': 'Blocked', '無法判斷': 'Unknown', 'Bilibili 港澳台': 'Bilibili HK/MO/TW',
  '僅自製劇': 'originals only', 'IP 被擋': 'IP blocked', '機房 IP 被擋': 'datacenter IP blocked', '僅限日本': 'Japan only', '僅網頁版': 'web only',
  '尚未開放': 'not offered yet', '港澳台': 'HK/MO/TW', '僅台灣': 'Taiwan only', 'Google 判定為 {cc}': 'Google places it in {cc}',
  '無法連線到檢測服務': 'Can’t reach the check service', '請先登入後台': 'Log in to the panel first',
  '這台節點沒有在執行檢測程式（未安裝或離線）': 'This node isn’t running the check agent (not installed, or offline)',
  '剛檢測過，請 {n} 分鐘後再試': 'Just checked; try again in {n} min', '檢測請求失敗（{status}）': 'Check request failed ({status})',
  '在地圖上定位': 'Show on map', '離線 {duration}': 'Offline {duration}', 'CPU {n} 核': 'CPU, {n} cores', '記憶體': 'Memory', '硬碟': 'Disk',
  '流量': 'Traffic', '等待資料…': 'Waiting for data…', '節點離線': 'Node offline', '超時': 'Timeout',
  '預設': 'Default', '網速': 'Speed', '名稱': 'Name', '節點': 'Nodes', '篩選名稱、國家、系統…': 'Filter by name, country, OS…', '排序': 'Sort',
  '沒有符合的節點': 'No matching nodes', '已連線': 'Connected', '輪詢中': 'Polling', '連線中': 'Connecting', '平均 CPU': 'Avg CPU',
  '未知': 'Unknown', '跨海（未對應海纜）': 'Sea crossing (no cable matched)', '追蹤在此中斷，沒有到達 {place}': 'Trace stopped here, never reached {place}',
  '未到達': 'Not reached', '{date} 快照': 'Traced {date}', '本機': 'this node', '{n} 條': '{n}', '從本機出發的實際路徑，點一條展開': 'Real paths from this node; open one',
  '返回清單': 'Back to list', '系統資訊': 'System', '架構': 'Arch', '系統': 'OS', '虛擬化': 'Virtualization', '地區': 'Region', '核心': 'Kernel',
  '資源': 'Resources', '延遲': 'Latency', '沒有延遲監控': 'No latency monitors', '網路': 'Network', '總上傳': 'Total up', '總下載': 'Total down', '進程': 'Processes',
  '負載': 'Load', '{n} 分鐘': '{n} min', '其他': 'Other', '運行時間': 'Uptime', '到期': 'Expires', '節點離線，沒有即時資料': 'Node offline, no live data',
  '完整詳情與歷史曲線': 'Full details and history',
  '顯示設定': 'Display', '只影響這個瀏覽器，站長的預設值在後台主題設定裡': 'Only this browser; the site’s defaults are in the panel’s theme settings',
  '地圖模式': 'Map', '地球自動旋轉': 'Spin the globe', '拓撲連線': 'Topology links', '目前沒有可顯示的拓撲': 'No topology to show',
  '真實路由': 'Real routes', '連線沿實際的 AS 路徑走': 'Links follow the real AS path', '需先開啟拓撲連線': 'Turn on topology links first',
  '點亮有節點的國家': 'Light up countries with nodes', '地圖節點標籤': 'Map labels', '速率': 'Speed', '名稱+速率': 'Name + speed', '關': 'Off',
  '恢復站長預設': 'Reset to site defaults', '離開全螢幕': 'Exit full screen', '全螢幕': 'Full screen', '已登入：前往後台': 'Logged in: open the panel', '登入後台': 'Log in',
  '總價值 {amount} / 年': 'Total value {amount} / yr', '未計入（沒有匯率）：{list}': 'Not counted (no rate): {list}', '{n} 台有標價的伺服器，依計費週期換算成一年': '{n} priced servers, each scaled from its billing cycle to a year',
  '{n} / {total} 台伺服器在線': '{n} / {total} servers online', '圖片': 'Image', '上一張': 'Previous image', '換一張': 'Next image',
  '玻璃模糊': 'Glass blur', '不透明度': 'Opacity',
  '最近 {n} 小時': 'Last {n} h', '最近 {n} 天': 'Last {n} days', '完整詳情': 'Full details', '關閉': 'Close', '時間範圍': 'Time range', 'CPU 使用率': 'CPU usage', '1 / 5 / 15 分鐘': '1 / 5 / 15 min', '1 分鐘': '1 min', '限額': 'Limit', '無限額': 'No limit', '這台節點沒有延遲監控': 'No latency probes for this node', '核心數': 'Cores', '在線時間': 'Uptime', '備註': 'Note', '背景圖片': 'Background image', '自己的圖片': 'Your own', '站長預設': 'Site default', '處理中…': 'Working…', '上傳圖片': 'Upload image', '不用背景': 'No background', '用站長預設': 'Use site default', '或貼上圖片網址': 'or paste an image URL', '套用': 'Apply', '模糊': 'Blur', '壓暗': 'Dim', '毛玻璃面板': 'Frosted-glass panels', '上傳的圖片只存在這個瀏覽器，不會傳到伺服器': 'An uploaded image stays in this browser; it is never sent to the server', '資源趨勢': 'Resources', '網路與流量': 'Network & traffic', '延遲・丟包': 'Latency & loss', '伺服器資訊': 'Server info', '請輸入 http(s):// 開頭的圖片網址': 'Enter an image URL starting with http(s)://', '無法讀取這張圖片': 'Cannot read this image', '圖片太大，瀏覽器存不下，請改用網址': 'Too large for browser storage; use a URL instead',
  '展開圖例': 'Show legend', '收起圖例': 'Hide legend', '其他海纜顯示為灰色': 'Grey out other cables', '只有節點路由經過的海纜保留顏色': 'Only cables a node route rides keep their colour', '外觀': 'Appearance', '淺色': 'Light', '深色': 'Dark', '跟隨系統': 'System', '語言': 'Language',
  '節點在線': 'Nodes online', '{n} 個國家／地區': '{n} countries / regions', '即時網速': 'Live throughput', '今日 ↑{up} ↓{down}': 'Today ↑{up} ↓{down}',
  '總覽': 'Overview', '卡片': 'Cards', '表格': 'Table',
  '{d} 天 {h} 小時': '{d}d {h}h', '{h} 小時 {m} 分': '{h}h {m}m', '{m} 分': '{m}m', '已過期 {d} 天': 'Expired {d}d ago',
  '今天到期': 'Expires today', '{d} 天後到期': '{d} days left', '月': 'month', '季': 'quarter', '半年': 'half-year', '年': 'year', '兩年': '2 years', '三年': '3 years',
  '一次性': 'one-off', '{n} 個月': '{n} months',
  '還沒有延遲資料。到後台「延遲」頁新增監控後，一分鐘內就會出現。': 'No latency data yet. Add monitors on the panel’s Latency page; they show up within a minute.',
  '{n} 個節點，近 1 小時': '{n} nodes, last hour',
  '找不到這個節點，可能已被隱藏或刪除。': 'This node isn’t here; it may have been hidden or removed.', '回總覽': 'Back to overview', '返回': 'Back',
  '{n} 核': '{n} cores', '{n} 核，負載 {load}': '{n} cores, load {load}', '作業系統': 'OS', '架構 / 虛擬化': 'Arch / virtualization', '即時': 'Live',
  '上傳 / 下載': 'Up / down', '累計流量': 'Total traffic', '今日流量': 'Today', '無': 'None', '計費': 'Billing', '價格': 'Price',
  '免費 / 未設定': 'Free / not set', '流量限額': 'Traffic cap', '本月已用': 'Used this month', '歷史': 'History', '讀取歷史失敗：{error}': 'Couldn’t load history: {error}',
  '平均': 'Average', '峰值': 'Peak', '上傳': 'Up', '下載': 'Down', '丟包': 'Loss', '已用': 'Used', '連線數': 'Connections',
  '{n} 小時': '{n} h', '{n} 天': '{n} days', '分組': 'Group', '本月流量': 'This month', '近 1 小時': 'last hour',
  '重新追蹤': 'Trace again', '追蹤中，約一分鐘': 'Tracing, about a minute', '路由追蹤請求失敗（{status}）': 'Trace request failed ({status})',
  '剛追蹤過，請 {n} 分鐘後再試': 'Just traced; try again in {n} min', '追蹤路由': 'Trace route', '尚未追蹤': 'Not traced yet',
  '沒有可以發起追蹤的節點': 'No node can start a trace',
}

const DICT: Record<Exclude<Lang, 'zh-Hant'>, Dict> = { 'zh-Hans': HANS, en: EN }
