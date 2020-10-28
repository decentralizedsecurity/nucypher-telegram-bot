const Web3 = require("web3");
const BN = require('bignumber.js');
const Telegraf = require('telegraf');
const { Markup } = Telegraf;

// Set proper environment variables before launch or run with BOT_TOKEN=123...456 INFURA_TOKEN=123..456 node nucypher-bot.js
const token = process.env.BOT_TOKEN;
const infura_token = process.env.INFURA_TOKEN;

const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${infura_token}`));

const { StakingEscrow } = require('./contract-registry');

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
    const nodeInfo = await getNodeInfo(account);
    if (nodeInfo.lastActivePeriod>nodeInfo.currentPeriod) 
    {
      ctx.replyWithHTML(`Everything OK! \n\n<pre> ${JSON.stringify(nodeSumary(nodeInfo) , null, 2)} </pre>`, Markup.keyboard([`/refresh ${account}`]).resize().extra())
    } else
    {
      ctx.replyWithHTML(`Something went wrong ... \n\n<pre> ${JSON.stringify(nodeSumary(nodeInfo) , null, 2)} </pre>`, Markup.keyboard([`/refresh ${account}`]).resize().extra())
    }
  } else
  {
    ctx.replyWithHTML(`You haven't provide an Ethereum addreess.\n\n Call /refresh with your staker address to get the node information`)
  }
})

bot.command('refresh', async (ctx) => {
  const account = ctx.update.message.text.slice(9);
  if (!!account && web3.utils.checkAddressChecksum(account))
  {
    const nodeInfo = await getNodeInfo(account);
    if (nodeInfo.lastActivePeriod>nodeInfo.currentPeriod) 
    {
      ctx.replyWithHTML(`Everything OK! \n\n<pre> ${JSON.stringify(nodeSumary(nodeInfo) , null, 2)} </pre>`, Markup.keyboard([`/refresh ${account}`]).resize().extra())
    } else
    {
      ctx.replyWithHTML(`Something went wrong ... \n\n<pre> ${JSON.stringify(nodeSumary(nodeInfo) , null, 2)} </pre>`, Markup.keyboard([`/refresh ${account}`]).resize().extra())
    }
  } else
  {
    ctx.replyWithHTML(`You haven't provide an Ethereum addreess.\n\n Call /refresh with your staker address to get the node information`)
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

function nodeSumary(node)
{
  return (({ stakerAddress, stakerBalance,workerAddress,workerBalance,workerState,lastConfirmationCost,availableForWithdraw }) => ({ stakerAddress, stakerBalance,workerAddress,workerBalance,workerState,lastConfirmationCost,availableForWithdraw  }))(node);
}







