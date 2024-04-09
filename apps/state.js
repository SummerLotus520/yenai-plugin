import _ from 'lodash'
import { createRequire } from 'module'
import moment from 'moment'
import os from 'os'
import plugin from '../../../lib/plugins/plugin.js'
import { Config, Version, Plugin_Name } from '../components/index.js'
import { status } from '../constants/other.js'
import { State, common, puppeteer } from '../model/index.js'
const require = createRequire(import.meta.url)

let interval = false
export class NewState extends plugin {
  constructor () {
    super({
      name: '椰奶状态',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^#?(椰奶)?(状态|监控)(pro)?$',
          fnc: 'state'
        }
      ]

    })
  }

  async monitor (e) {
    await puppeteer.render('state/monitor', {
      chartData: JSON.stringify(State.chartData)
    }, {
      e,
      scale: 1.4
    })
  }

  async state (e) {
    if (e.msg.includes('监控')) return this.monitor(e)

    if (!/椰奶/.test(e.msg) && !Config.whole.state) return false

    if (!State.si) return e.reply('❎ 没有检测到systeminformation依赖，请运行："pnpm add systeminformation -w"进行安装')

    // 防止多次触发
    if (interval) { return false } else interval = true
    // 系统
    let FastFetch; let HardDisk
    let otherInfo = []
    // 其他信息
    otherInfo.push({
      first: '系统',
      tail: State.osInfo?.distro
    })
    // 网络
    otherInfo.push(State.getnetwork)
    // 插件数量
    otherInfo.push(State.getPluginNum)
    let promiseTaskList = [
      State.getFastFetch(e).then(res => { FastFetch = res }),
      State.getFsSize().then(res => { HardDisk = res })
    ]

    // 网络测试
    let psTest = []
    let { psTestSites, psTestTimeout, backdrop, YZAvatar, Gradient } = Config.state
    psTestSites && promiseTaskList.push(...psTestSites?.map(i => State.getNetworkLatency(i.url, psTestTimeout).then(res => psTest.push({
      first: i.name,
      tail: res
    }))))
    // 执行promise任务
    await Promise.all(promiseTaskList)
    // 可视化数据
    let visualData = _.compact(await Promise.all([
      // CPU板块
      State.getCpuInfo(),
      // 内存板块
      State.getMemUsage(),
      // GPU板块
      State.getGPU(),
      // Node板块
      State.getNodeInfo()
    ]))

    /** bot列表 */
    let BotList = [e.self_id]

    if (e.msg.includes('pro')) {
      if (Array.isArray(Bot?.uin)) {
        BotList = Bot.uin
      } else if (Bot?.adapter && Bot.adapter.includes(e.self_id)) {
        BotList = Bot.adapter
      }
    }

    // 渲染数据
    let data = {
      backdrop,
      Gradient: JSON.stringify(Gradient),
      BotStatus: await this.getBotState(BotList, e, YZAvatar),
      chartData: JSON.stringify(common.checkIfEmpty(State.chartData, ['echarts_theme', 'cpu', 'ram']) ? undefined : State.chartData),
      // 硬盘内存
      HardDisk,
      // FastFetch
      FastFetch,
      // 硬盘速率
      fsStats: State.DiskSpeed,
      // 可视化数据
      visualData,
      // 其他数据
      otherInfo: _.compact(otherInfo),
      psTest: _.isEmpty(psTest) ? false : psTest
    }

    // 渲染图片
    await puppeteer.render('state/state', {
      ...data
    }, {
      e,
      scale: 1.4
    })

    interval = false
  }

  async getBotState (botList, e, YZAvatar) {
    const defaultAvatar = `../../../../../plugins/${Plugin_Name}/resources/state/img/default_avatar.jpg`
    const BotName = Version.name
    const systime = common.formatTime(os.uptime(), 'dd天hh小时mm分', false)
    const calendar = moment().format('YYYY-MM-DD HH:mm:ss')

    const dataPromises = botList.map(async (i) => {
      const bot = Bot[i]
      if (!bot?.uin) return ''

      const avatar = bot.avatar || (Number(bot.uin) ? `https://q1.qlogo.cn/g?b=qq&s=0&nk=${bot.uin}` : defaultAvatar)
      const nickname = bot.nickname || '未知'
      const onlineStatus = status[bot.status] || '在线'
      const platform = bot.apk ? `${bot.apk.display} v${bot.apk.version}` : bot.version?.version || '未知'

      const [sent, recv, screenshot] = await Promise.all([
        redis.get(`Yz:count:send:msg:bot:${bot.uin}:total`),
        redis.get(`Yz:count:receive:msg:bot:${bot.uin}:total`) || bot.stat?.recv_msg_cnt || '未知',
        redis.get(`Yz:count:send:image:bot:${bot.uin}:total`)
      ])

      const friendQuantity = bot.fl?.size || 0
      const groupQuantity = bot.gl?.size || 0
      const groupMemberQuantity = Array.from(bot.gml?.values() || []).reduce((acc, curr) => acc + curr.size, 0)
      const runTime = common.formatTime(Date.now() / 1000 - bot.stat?.start_time, 'dd天hh小时mm分', false)
      const botVersion = bot.version ? `${bot.version.name}(${bot.version.id})${bot.apk ? ` ${bot.version.version}` : ''}` : `ICQQ(QQ) v${require('@icqqjs/icqq/package.json').version}`
      // 频道
      let guildsQuantity
      try { guildsQuantity = Array.from(bot.guilds.values()).length } catch { }

      return `<div class="box">
    <div class="tb">
        <div class="avatar">
            <img src="${avatar}"
                onerror="this.src= '${defaultAvatar}'; this.onerror = null;">
        </div>
        <div class="header">
            <h1>${nickname}</h1>
            <hr noshade>
            <p>${onlineStatus}(${platform}) | 收${recv || 0} | 发${sent || 0} | 图片${screenshot || 0}</p>
            <p>好友：${friendQuantity} | 群：${groupQuantity} | 群员：${groupMemberQuantity} | 频道：${guildsQuantity || 0} | ${process.platform}(${process.arch})</p>
            <p>${BotName} 已运行 ${runTime} | 系统运行 ${systime}</p>
            <p>${calendar} | Node.js ${process.version} | ${botVersion} </p>
        </div>
    </div>
</div>
`
    })

    const dataArray = await Promise.all(dataPromises)
    if (this.e.msg.includes('pro')) {
      dataArray.unshift(`<div class="box">
      <div class="tb">
          <div class="avatar">
              <img src="${YZAvatar || defaultAvatar}"
                  onerror="this.src= '${defaultAvatar}'; this.onerror = null;">
          </div>
          <div class="header">
              <h1>${BotName}</h1>
              <hr noshade>
              <p>适配器连接数量：${botList.length}</p>
              <p>${await this.getCount()}</p>
          </div>
      </div>
  </div>
  `)
    }
    return dataArray.join('')
  }

  async getCount () {
    const month = Number(moment().month()) + 1
    const key = 'Yz:count:'
    const msgKey = {
      day: `${key}sendMsg:day:`,
      month: `${key}sendMsg:month:`
    }

    const screenshotKey = {
      day: `${key}screenshot:day:`,
      month: `${key}screenshot:month:`
    }

    let week = {
      msg: 0,
      screenshot: 0
    }
    for (let i = 0; i <= 6; i++) {
      let date = moment().startOf('week').add(i, 'days').format('MMDD')

      week.msg += Number(await redis.get(`${msgKey.day}${date}`)) ?? 0
      week.screenshot += Number(await redis.get(`${screenshotKey.day}${date}`)) ?? 0
    }

    let count = {
      total: {
        msg: await redis.get(`${key}sendMsg:total`) || 0,
        screenshot: await redis.get(`${key}screenshot:total`) || 0
      },
      week,
      month: {
        msg: await redis.get(`${msgKey.month}${month}`) || 0,
        screenshot: await redis.get(`${screenshotKey.month}${month}`) || 0
      }
    }

    let msg = []
    msg.push(`累计：发${count.total.msg} | 图片${count.total.screenshot}`)
    msg.push(`本周：发${count.week.msg} | 图片${count.week.screenshot}`)
    msg.push(`本月：发${count.month.msg} | 图片${count.month.screenshot}`)

    return msg.join('<br>')
  }
}
