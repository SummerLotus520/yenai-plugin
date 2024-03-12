import _ from 'lodash'
import fetch from 'node-fetch'
import plugin from '../../../lib/plugins/plugin.js'
import { Config } from '../components/index.js'
import { heisiType, pandadiuType, xiurenTypeId } from '../constants/fun.js'
import { common, funApi, uploadRecord } from '../model/index.js'

/** 开始执行文案 */
const START_EXECUTION = '椰奶产出中......'

const picApis = Config.getConfig('picApi')
/** 解析匹配模式 */
const picApiKeys = []

_.forIn(picApis, (values, key) => {
  let mode = values.mode !== undefined ? values.mode : picApis.mode
  key = key.split('|').map(item => mode ? '^' + item + '$' : item).join('|')
  picApiKeys.push(key)
})

const apiReg = new RegExp(`(${picApiKeys.join('|')}|^jktj$|^接口统计$)`)

export class Fun extends plugin {
  constructor () {
    super({
      name: '椰奶娱乐',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#唱歌$',
          fnc: 'Sing'
        },
        {
          reg: '^#支付宝到账',
          fnc: 'ZFB'
        },
        {
          reg: '^#(([\u4e00-\u9fa5]{2,6})-)?([\u4e00-\u9fa5]{2,6})?翻译(.*)$',
          fnc: 'youdao'
        },
        {
          reg: /^#?[赞超操草抄炒][我他她](pro)?$/i,
          fnc: 'thumbUp'
        },
        {
          reg: 'github.com/[a-zA-Z0-9-]{1,39}/[a-zA-Z0-9_-]{1,100}',
          fnc: 'GH'
        },
        {
          reg: '^#?coser$',
          fnc: 'coser'
        },
        // {
        //   reg: `^#?来点(${Object.keys(heisiType).join('|')})$`,
        //   fnc: 'heisiwu'
        // },
        {
          reg: '^#?铃声搜索',
          fnc: 'lingsheng'
        },
        {
          reg: '^#?半次元话题$',
          fnc: 'bcyTopic'
        },
        {
          reg: apiReg,
          fnc: 'picture'
        },
        // {
        //   reg: '^#?来点神秘图(\\d+|s.*)?$',
        //   fnc: 'mengdui'
        // },
        {
          reg: `^#(${Object.keys(pandadiuType).join('|')})?acg`,
          fnc: 'acg'
        },
        {
          reg: `^#来点(${Object.keys(xiurenTypeId).join('|')})$`,
          fnc: 'xiuren'
        }

      ]
    })
  }

  /** 随机唱鸭 */
  async Sing (e) {
    let data = await funApi.randomSinging()
    if (data.error) return e.reply(data.error)
    try {
      await e.reply(await uploadRecord(data.audioUrl, 0, false))
    } catch (error) {
      console.log(error)
    }
    await e.reply(data.lyrics)
  }

  /** 支付宝语音 */
  async ZFB (e) {
    let amount = parseFloat(e.msg.replace(/#|支付宝到账|元|圆/g, '').trim())

    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return e.reply('你觉得这河里吗！！', true)

    if (!(amount >= 0.01 && amount <= 999999999999.99)) {
      return e.reply('数字大小超出限制，支持范围为0.01~999999999999.99')
    }
    e.reply([segment.record(`https://mm.cqu.cc/share/zhifubaodaozhang/mp3/${amount}.mp3`)])
  }

  /** 有道翻译 */
  async youdao (e) {
    const msg = e.msg.match(/#(([\u4e00-\u9fa5]{2,6})-)?([\u4e00-\u9fa5]{2,6})?翻译(.*)/)
    // 如果是在群聊中回复，则获取上一条消息作为翻译内容
    if (e.source) {
      const source = e.isGroup
        ? (await e.group.getChatHistory(e.source.seq, 1)).pop()
        : (await e.friend.getChatHistory(e.source.time, 1)).pop()

      msg[4] = source.message
        .filter(item => item.type === 'text')
        .map(item => item.text).join('')
    }
    const results = await funApi.youdao(msg[4], msg[3], msg[2])
    e.reply(results, true)
  }

  /** 点赞 */
  async thumbUp (e) {
    return await funApi.thumbUp(e)
  }

  // github
  async GH (e) {
    const api = 'https://opengraph.githubassets.com'

    let reg = /github.com\/[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_-]{1,100}(?:\/(?:pull|issues)\/\d+)?/
    const isMatched = e.msg.match(reg)

    const id = 'Yenai'
    if (isMatched) {
      // const res = isMatched[0].split('/')
      let path = isMatched[0].replace('github.com/', '')
      e.reply(segment.image(`${api}/${id}/${path}`))
      // const [user, repo] = [res[1], res[2].split('#')[0]]
      // e.reply(segment.image(`${api}/${id}/${user}/${repo}`))
    }
  }

  // coser
  async coser (e) {
    if (!common.checkSeSePermission(e)) return false

    e.reply(START_EXECUTION)
    await funApi.coser()
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => common.handleException(e, err))
  }

  // cos/acg搜索
  async acg (e) {
    if (!common.checkSeSePermission(e)) return false
    e.reply(START_EXECUTION)
    const reg = new RegExp(`^#(${Object.keys(pandadiuType).join('|')})?acg(.*)$`)
    const type = e.msg.match(reg)
    await funApi.pandadiu(type[1], type[2])
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => common.handleException(e, err))
  }

  // 黑丝
  async heisiwu (e) {
    if (!common.checkSeSePermission(e, 'sesepro')) return false

    e.reply(START_EXECUTION)
    // 获取类型
    const { type, page } = heisiType[e.msg.match(/#?来点(.*)/)[1]]
    await funApi.heisiwu(type, page)
      .then(res => common.recallSendForwardMsg(e, _.take(res, 20)))
      .catch(err => common.handleException(e, err))
  }

  // 萌堆
  async mengdui (e) {
    if (!common.checkSeSePermission(e, 'sesepro')) return false
    // 开始执行
    e.reply(START_EXECUTION)
    let regRet = e.msg.match(/#?来点神秘图(s)?(.*)/)
    await funApi.mengdui(regRet[2], regRet[1])
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => common.handleException(e, err))
  }

  async xiuren (e) {
    if (!common.checkSeSePermission(e, 'pro')) return false
    // 开始执行
    e.reply(START_EXECUTION)
    await funApi.xiuren(e.msg.replace(/#?来点/, ''))
      .then(res => common.recallSendForwardMsg(e, res))
      .catch(err => common.handleException(e, err))
  }

  // 铃声多多
  // async lingsheng (e) {
  //   let msg = e.msg.replace(/#|铃声搜索/g, '')
  //   let num = Math.ceil(Math.random() * 15)
  //   if (num == 0) num = 1
  //   let api = `http://xiaobai.klizi.cn/API/music/lingsheng.php?msg=${msg}&n=${num}`
  //   let res = await fetch(api).then(res => res.json()).catch(err => logger.error(err))
  //   if (!res) return e.reply(API_ERROR)
  //   if (res.title == null && res.author == null) return e.reply('❎ 没有找到相关的歌曲哦~', true)

  //   await e.reply([
  //     `标题：${res.title}\n`,
  //     `作者：${res.author}`
  //   ])
  //   await e.reply(await uploadRecord(res.aac, 0, false))
  // }

  /** 半次元话题 */
  // async bcyTopic (e) {
  //   let api = 'https://xiaobai.klizi.cn/API/other/bcy_topic.php'
  //   let res = await fetch(api).then(res => res.json()).catch(err => logger.error(err))
  //   if (!res) return e.reply(API_ERROR)
  //   if (res.code != 200) return e.reply('❎ 出错辣' + JSON.stringify(res))
  //   if (_.isEmpty(res.data)) return e.reply('请求错误！无数据，请稍后再试')
  //   let msg = []
  //   for (let i of res.data) {
  //     if (!i.title || _.isEmpty(i.image)) continue
  //     msg.push(i.title)
  //     msg.push(i.image.map(item => segment.image(item)))
  //   }
  //   if (_.isEmpty(msg)) return this.bcyTopic(e)
  //   common.getforwardMsg(e, msg)
  // }

  // api大集合
  async picture (e) {
    let { sese, sesepro } = Config.getGroup(e.group_id)
    if (!sese && !sesepro && !e.isMaster) return false
    let key = 'yenai:apiAggregate:CD'
    if (await redis.get(key)) return false

    if (/jktj|接口统计/.test(e.msg)) {
      let msg = ['现接口数量如下']
      for (let i in picApis) {
        if (i == 'mode') continue
        let urls = picApis[i].url || picApis[i]
        msg.push(`\n♡ ${i} => ${Array.isArray(urls) ? urls.length : 1}`)
      }
      return e.reply(msg)
    }
    // 解析消息中的类型
    let regRet = apiReg.exec(e.msg)
    if (regRet[1] == 'mode') return false
    let picObj = picApis[_.sample(Object.keys(picApis).filter(item => new RegExp(item).test(regRet[1])))]
    if (Array.isArray(picObj)) picObj = _.sample(picObj)
    let urlReg = /^https?:\/\/(([a-zA-Z0-9_-])+(\.)?)*(:\d+)?(\/((\.)?(\?)?=?&?[a-zA-Z0-9_-](\?)?)*)*$/i
    if (!picObj.url && !urlReg.test(encodeURI(picObj)) && !Array.isArray(picObj)) {
      return logger.error(`${e.logFnc}未找到url`)
    }

    if (picObj.type !== 'image' && picObj.type !== 'text' && picObj.type !== 'json' && picObj.type) {
      return logger.error(`${e.logFnc}类型不正确`)
    }

    let url = picObj.url || picObj
    // 数组随机取或指定
    if (Array.isArray(url)) url = _.sample(url)

    url = encodeURI(url)

    if (picObj.type == 'text') {
      url = await fetch(url).then(res => res.text()).catch(err => logger.error(err))
    } else if (picObj.type == 'json') {
      if (!picObj.path) return logger.error(`${e.logFnc}json未指定路径`)
      let res = await fetch(url).then(res => res.json()).catch(err => logger.error(err))
      url = _.get(res, picObj.path)
    }
    if (!url) return logger.error(`${e.logFnc}未获取到图片链接`)

    logger.debug(`${e.logFnc}使用接口:${url}`)
    common.recallsendMsg(e, segment.image(url))
    redis.set(key, 'cd', { EX: 2 })
  }
}
