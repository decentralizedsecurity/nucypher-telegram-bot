const Web3 = require("web3");
const BN = require('bignumber.js');
const Telegraf = require('telegraf');
const { Markup } = Telegraf;
const CronJob = require('cron').CronJob;;
const emojis = {ok: "👌",warning: "‼️",bell_on:"🔔",bell_off:"🔕",follow_on:"✅",follow_off:"☑️",refresh:"🔄"};

const job = new CronJob('00 01 * * *', function() {
  checkClients()
});

job.start();

const clients = [];
const interval = 1000; //3600000 = 1 hour

function getClientIndex(chatId)
{
  for (let i = 0; i < clients.length; i++) {
    if (clients[i].chatId = chatId)
    {
      return i;
    }
  }
  throw "Unknown"
}


function setClient(chatId,account,lastMessage,ok,warning)
{
  const client = {};
  client.chatId = chatId;
  client.account = account;
  client.lastMessage = lastMessage;
  client.ok = ok;
  client.warning = warning;
  try { 
    index = getClientIndex(chatId);
    clients[index] = client;
    return client;
  }
  catch (e) { //Add the a new client
    clients.push(client);
    return client;
  }
}

function deleteClient(chatId,account)
{
  //returns an empty client to create the Keyboard with defaults
  const client = {};
  client.chatId = chatId;
  client.account = account;
  client.ok = false;
  client.warning = true;
  try { 
    index = getClientIndex(chatId);
    clients.splice(index, 1);
    return client;
  }
  catch (e) { 
    return client;
  }
}

// Set proper environment variables before launch or run with BOT_TOKEN=123...456 INFURA_TOKEN=123..456 node nucypher-bot.js
const token = process.env.BOT_TOKEN;
const infura_token = process.env.INFURA_TOKEN;

const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infura_token}`));

const { StakingEscrow } = require('./contract-registry');

async function checkClientAndNotify(client)
{
  const account = client.account;
  const chatId = client.chatId;
  const lastMessage = client.lastMessage
  const timestamp = new Date().getTime();
  const nodeInfo = await getNodeInfo(account);
  const text = `${getShortFeedback(nodeInfo.lastActivePeriod,nodeInfo.currentPeriod,timestamp)}\n\n${nodeSumary(nodeInfo)}`;
  const keyboard = getKeyboard(client);

  if (nodeInfo.lastActivePeriod<=nodeInfo.currentPeriod) 
  {
    if (client.warning)
    {
        bot.telegram.deleteMessage(chatId,lastMessage)
        bot.telegram.sendMessage(chatId,text, {parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"}).then((m) => {
          setClient(chatId,account,m.message_id,client.ok,client.warning);
        })
    } else
    {
      bot.telegram.editMessageText(
        chatId,
        lastMessage,
        undefined,
        text,
        {parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"}
      ).catch(function(e) {
        if (e.code != 400) console.log(e); // 400 corresponds to message and keyboard are the same
      });
    }
    setTimeout(checkClientAndNotify, interval,client); 
  } else
  {
    if (client.ok)
    {
        bot.telegram.deleteMessage(chatId,lastMessage)
        bot.telegram.sendMessage(chatId,text, {parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"}).then((m) => {
          setClient(chatId,account,m.message_id,client.ok,client.warning);
        })
    } else
    {
      bot.telegram.editMessageText(
        chatId,
        lastMessage,
        undefined,
        text,
        {parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"}
      ).catch(function(e) {
        if (e.code != 400) console.log(e); // 400 corresponds to message and keyboard are the same
      });
    }
  }
}

async function checkClients()
{
  for (const client of clients){
    console.log(`notify ${client.chatId} for account ${client.account}`);
    checkClientAndNotify(client);
  } 
}

function getShortFeedback(lastActivePeriod,currentPeriod,timestamp)
{
  const time = new Date(timestamp).toISOString().slice(-13, -5);
  const date = new Date(timestamp).toISOString().slice(0, 10);
  //TODO: improve time and date presentation ... https://stackoverflow.com/a/35890537 
  if (lastActivePeriod>currentPeriod) 
  {
    return `${emojis.ok} Everything OK!\nLast update: ${time} UTC ${date}`
  } else
  {
    return `${emojis.warning} Something went wrong ...\nLast update: ${time} UTC ${date}`
  }
}

function getKeyboard(client)
{
  const address = client.account;
  const monitor = !!client.lastMessage;
  const ok = client.ok;
  const warning = client.warning;
  
  if (monitor) 
  {
    return Markup.inlineKeyboard([
      Markup.callbackButton(`${emojis.refresh} Refresh`, `refresh ${address}`),
      Markup.callbackButton(`${emojis.follow_on} Following`, `unfollow ${address}`) ,
      (ok ? Markup.callbackButton(`${emojis.ok}${emojis.bell_on}`, `follow ${address} false ${warning}`) : Markup.callbackButton(`${emojis.ok}${emojis.bell_off}`, `follow ${address} true ${warning}`)),
      (warning ? Markup.callbackButton(`${emojis.warning}${emojis.bell_on}`, `follow ${address} ${ok} false`) : Markup.callbackButton(`${emojis.warning}${emojis.bell_off}`, `follow ${address} ${ok} true`)),
    ]).extra()
  } else
  {
    return Markup.inlineKeyboard([
      Markup.callbackButton(`${emojis.refresh} Refresh`, `refresh ${address}`),
      Markup.callbackButton(`${emojis.follow_off} Following`, `follow ${address} ${ok} ${warning}`)
    ]).extra()
  }
}


const contracts = {
  "stakingEscrowAddress": "0xbbD3C0C794F40c4f993B03F65343aCC6fcfCb2e2",
  "tokenAddress": "0x4fe83213d56308330ec302a8bd641f1d0113a4cc",
  "policyManagerAddress": "0x67E4A942c067Ff25cE7705B69C318cA2Dfa54D64",
  "workLockAddress": "0xe9778E69a961e64d3cdBB34CF6778281d34667c2"
}

const contract = new web3.eth.Contract(StakingEscrow, contracts.stakingEscrowAddress);

const bot = new Telegraf(token)

bot.start(async (ctx) => {
  if (!!ctx.startPayload && web3.utils.checkAddressChecksum(ctx.startPayload))
  {
    const account = ctx.startPayload;
    const chatId = ctx.message.chat.id;
    const timestamp = new Date().getTime();
    const nodeInfo = await getNodeInfo(account);
    const client = deleteClient(chatId,account); //reset client
    const text = `${getShortFeedback(nodeInfo.lastActivePeriod,nodeInfo.currentPeriod,timestamp)}\n\n${nodeSumary(nodeInfo)}`;
    const keyboard = getKeyboard(client);

    if (nodeInfo.lastActivePeriod>nodeInfo.currentPeriod) 
    {
      ctx.replyWithHTML(text,{parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"})
    } else
    {
      ctx.replyWithHTML(text,{parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"})
    }
  } else //TODO: recover account from Clients when cleaning chats
  {
    ctx.replyWithHTML(`You haven't provided an Ethereum address.\n\n Call /start with your staker address to get the node information`)
  }
})

bot.action(/^follow (0x[A-F,a-f,0-9]{40}) (true|false) (true|false)/, async (ctx) => {
  if ((!!ctx.match)&&(ctx.match.length>3)&&web3.utils.checkAddressChecksum(ctx.match[1]))
  {
    console.log(`follow account=${ctx.match[1]} ok=${ctx.match[2]} warning=${ctx.match[3]}`);
    const chatId = ctx.callbackQuery.message.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;
    const account = ctx.match[1];
    const nodeInfo = await getNodeInfo(account);
    const timestamp = new Date().getTime();
    const text = `${getShortFeedback(nodeInfo.lastActivePeriod,nodeInfo.currentPeriod,timestamp)}\n\n${nodeSumary(nodeInfo)}`;
    const ok = (ctx.match[2] == 'true');
    const warning = (ctx.match[3] == 'true');
    const keyboard = getKeyboard(setClient(chatId,account,messageId,ok,warning));
    ctx.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      text,
      {parse_mode:"HTML",reply_markup:keyboard.reply_markup,disable_web_page_preview:"True"}
      );
  }
})

bot.action(/^unfollow (.*)/, async (ctx) => {
  if ((!!ctx.match)&&(ctx.match.length>=1)&&web3.utils.checkAddressChecksum(ctx.match[1]))
  {
    console.log("unfollow "+ctx.match[1]);
    const chatId = ctx.callbackQuery.message.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;
    //const text = ctx.callbackQuery.message.text;
    const account = ctx.match[1];
    const nodeInfo = await getNodeInfo(account);
    const timestamp = new Date().getTime();
    const text = `${getShortFeedback(nodeInfo.lastActivePeriod,nodeInfo.currentPeriod,timestamp)}\n\n${nodeSumary(nodeInfo)}`;   
    const client = deleteClient(chatId,account);
    ctx.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      text,
      {parse_mode:"HTML",reply_markup:getKeyboard(client).reply_markup,disable_web_page_preview:"True"}
    );
  }
})

bot.action(/^refresh (.*)/, async (ctx) => {
  
  if ((!!ctx.match)&&(ctx.match.length>=1)&&web3.utils.checkAddressChecksum(ctx.match[1]))
  {
    console.log("refresh "+ctx.match[1]);
    const account = ctx.match[1];
    const chatId = ctx.callbackQuery.message.chat.id;
    const keyboard = ctx.callbackQuery.message.reply_markup;
    const timestamp = new Date().getTime();
    const messageId = ctx.callbackQuery.message.message_id;
    const client = {};
    try {
      client = clients[getClientIndex(chatId)];
    } catch (error) {
      client.chatId = chatId;
      client.account = account;
      client.lastMessage = messageId;
    }   
    const nodeInfo = await getNodeInfo(account);
    const msg = `${getShortFeedback(nodeInfo.lastActivePeriod,nodeInfo.currentPeriod,timestamp)}\n\n${nodeSumary(nodeInfo)}`;    
    ctx.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      msg,
      {parse_mode:"HTML",reply_markup:keyboard,disable_web_page_preview:"True"}
    );
  } else
  {
    ctx.replyWithHTML(`You haven't provided an Ethereum address.\n\n Call /start with your staker address to get the node information`)
  }
})

bot.launch()

class Node {
  constructor(obj) {
    this.lockReStakeUntilPeriod = obj.lockReStakeUntilPeriod;
    this.workerAddress = obj.worker;
    this.workerBalance = null;
    this.workerStartPeriod = obj.workerStartPeriod;
    this.lastActivePeriod = obj.lastActivePeriod;
    this.completedWork = obj.completedWork;
    this.pastDowntime = obj.pastDowntime;
    this.totalStake = obj.value;
    this.substakes = [];
    this.stakerAddress = null;
    this.stakerBalance = null;
    this.lockedTokens = null;
    this.availableForWithdraw = null;
    this.currentPeriod = null;
    this.flags = obj.flags;
    this.workerState = null;
    this.lastConfirmationCost = null;
  }
}

class SubStake {
  constructor(obj) {
    this.index = obj.index;
    this.firstPeriod = obj.firstPeriod;
    this.lastPeriod = obj.lastPeriod;
    this.value = obj.value;
    this.remainingDuration = obj.remainingDuration;
  }
}

function getWorkerState( currentPeriod, lastActivePeriod){
  let workerActivityState = null;
  if ( lastActivePeriod === '0') {
    workerActivityState = 'Never confirmed activity';
  } else if (currentPeriod < lastActivePeriod) {
    workerActivityState =  'Next period confirmed';
  } else if (currentPeriod === lastActivePeriod) {
    workerActivityState =  'Current period confirmed. Next period confirmation pending';
  } else if (currentPeriod > lastActivePeriod) {
    workerActivityState = 'Current period is not confirmed';
  }

  return workerActivityState
}

function isHexNil(hex) {
  return hex === '0x0000000000000000000000000000000000000000';
}

function toNumberOfTokens(amount) {
  return BN(Web3.utils.fromWei(amount.toString())).toNumber();
}

async function getNodeInfo(account) {
  const node = new Node(await contract.methods.stakerInfo(account).call());
  node.lockedTokens = await contract.methods.getLockedTokens(account, 1).call();
  node.availableForWithdraw = toNumberOfTokens((new web3.utils.BN(node.totalStake)).sub(new web3.utils.BN(node.lockedTokens)).toString());
  if (!isHexNil(node.worker)) {
    node.lastActivePeriod = await contract.methods.getLastCommittedPeriod(account).call();
  }
  node.stakerAddress = account;
  node.substakes = await getSubStakes(account);
  node.flags =  await getFlagsForStaker(account);
  node.currentPeriod = await getCurrentPeriod();
  node.stakerBalance = await getBalance(node.stakerAddress);
  node.workerBalance = await getBalance(node.workerAddress);
  node.workerState = getWorkerState(node.currentPeriod,node.lastActivePeriod)
  node.lastConfirmationCost = await getLastGasCost(account);
  return node;
}

async function getSubStakes(account) {
  const substakesCount = await contract.methods.getSubStakesLength(account).call();
  const substakes = [];
  for (let currentSubStakeIndex = 0; currentSubStakeIndex < substakesCount; currentSubStakeIndex++) {
    const subStake = await contract.methods.getSubStakeInfo(account, currentSubStakeIndex).call();
    const firstPeriod = new Date(1000 * 60 * 60 * 24 * subStake.firstPeriod);
    let lastPeriod;
    if (subStake.lastPeriod === '0') {
      lastPeriod = new Date();
      lastPeriod.setTime(lastPeriod.getTime() + ((+subStake.periods + 1) * 24 * 60 * 60 * 1000));
      lastPeriod.setHours(0, 0, 0, 0);
    } else {
      lastPeriod = new Date(1000 * 60 * 60 * 24 * (+subStake.lastPeriod + 1));
      lastPeriod.setHours(0, 0, 0, 0);
    }
    substakes.push(new SubStake({
      index: currentSubStakeIndex,
      firstPeriod,
      lastPeriod,
      value: subStake.lockedValue,
      remainingDuration: (+subStake.periods) + 1
    }));
  }
  return substakes;
}

async function getCurrentPeriod() {
  return await contract.methods.getCurrentPeriod().call();
}

async function getFlagsForStaker(account) {
  const flags = await contract.methods.getFlags(account).call();
  return flags;
}

async function getBalance(account) {
  return web3.utils.fromWei(await web3.eth.getBalance(account));
}

async function getLastGasCost(account)
{

  const activityConfirmedEvents = (await contract.getPastEvents('CommitmentMade', { filter: { staker: account }, fromBlock: 0, toBlock: 'latest' }));//.map(a => { return { type: 'commitmentMade', block: a.blockNumber, ...a.returnValues } });
  gasCost = 0;
  if (!!activityConfirmedEvents && (activityConfirmedEvents.length >0))
  {
    const hash = activityConfirmedEvents[activityConfirmedEvents.length-1].transactionHash;
    const tx = await web3.eth.getTransaction(hash);
    const receipt = await web3.eth.getTransactionReceipt(hash);
    gasCost = web3.utils.fromWei(BN(tx.gasPrice).times(BN(receipt.gasUsed)).toString());
  }
  return gasCost
}

function shortenAddress(address)
{
  const n = 8;
  return address.slice(0,n+2)+"..."+address.slice(-n);
}

function round(number,digits)
{
  return Number(Math.round(number + `e${digits}`) + `e-${digits}`);
}

function checkWorkerBalance(workerBalance,lastConfirmationCost)
{
  check = "";
  if (workerBalance<lastConfirmationCost*2) check= "❗"
  return check;
}
function nodeSumary(node)
{
  return `StakerAddress
  ▶️ <a href="https://etherscan.io/address/${node.stakerAddress}">${shortenAddress(node.stakerAddress)}</a>
StakerBalance
  ▶️ <code>${round(node.stakerBalance,6)} ETH</code>
WorkerAddress
  ▶️ <a href="https://etherscan.io/address/${node.workerAddress}">${shortenAddress(node.workerAddress)}</a>
WorkerBalance
  ▶️ <code>${checkWorkerBalance(node.workerBalance,node.lastConfirmationCost)}${round(node.workerBalance,6)} ETH</code>
WorkerState
  ▶️ ${node.workerState}
LastConfirmationCost
  ▶️ <code>${round(node.lastConfirmationCost,6)} ETH</code>
AvailableForWithdraw
  ▶️ <code>${round(node.availableForWithdraw,2)} NU</code>
`
}







