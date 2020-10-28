# nucypher-telegram-bot

This is very simplistic monitor for your Nucypher Node that sends updates using a Telegram bot.

I borrowed the Telegram Bot code from [Sinequanonh](https://gist.github.com/Sinequanonh): https://gist.github.com/Sinequanonh/f5625a2807f89ce4f6634cd3b1ab65a0 and the Nucypher specific code from [cryptoseal86](https://github.com/cryptoseal86): https://github.com/cryptoseal86/stake-nucypher with some minor adaptations to run it in Node.js

The monitor gets the Staker information from the NuCypher contract using Infura. It also gets the balances of the worker and staker addresses and the gas cost of the last activity confirmation transaction. This could help estimating if the funds for the worker are enough for next period.

You need to set some scheduler, e.g. Cron, to launch the monitor once a day, e.g. at 8 a.m., and if everything is correct the Telegram Bot will send you a message with a summary of the Node info. The monitor will check in every run that the last confirmed period is greater than the current period and in case it is not, it will notify that something is wrong and schedule another check after one hour recurrently until you either kill the process of resolve the situation, e.g. restart the worker.

Apart from this monitor, in the repo you can also find `nucypher-bot.js`. This Bot will run forever and will get the Staker address using Deep Link from the `/start`command. You can use the command `/refres 0xYOUR_STAKER_ADDRESS` providing you staker address in order to get the node info. The response will include the button to refresh it just by pressing it. You can try the Bot at: [NuCpher Telegram Bot](https://t.me/NuCypherMonitorBot). The Bot is stateless, you need to either provide your staker account every time or press the refresh button. The Bot stores no information about the request and it is not guaranteed to work, I am hosting it just to demonstrate the functionality.

## Prerequisites

1. You need to create first a Telegram Bot and get the corresponding TOKEN. Just follow this guide: [Bots: An introduction for developers](https://core.telegram.org/bots)

2. You also need to get the ChatID of your Bot. In order to get it, start a conversation with your bot and look for the "chat" object and ID property in the list of updates of your bot using the following URL:
```
https://api.telegram.org/bot<YourBOTToken>/getUpdates
```

3. You need to register to Infura and get the Infura endpoint. 

## Installation

In order to run the monitor you need to first install [Node.js](https://nodejs.org/). I am assuming you are using Cron to run the monitor periodically. You need to properly set the following enviroment variables before running the script: 
- BOT_TOKEN : The Telegram Bot Token
- INFURA_TOKEN : The token used in the infura URL, just the token, not he whole URL.
- CHAT_ID : Your Chat ID
- STAKER_ACCOUNT :  Your Staker account

For hints on how to do it for Cron follow this link: https://stackoverflow.com/questions/2229825/where-can-i-set-environment-variables-that-crontab-will-use

1. Open a Terminal and go to some folder where you want to install the monitor
2. Clone this repository
```bash
git clone https://github.com/decentralizedsecurity/nucypher-telegram-bot.git
```
3. Move to the project folder
```bash
cd nucypher-telegram-bot
```
4. Install all dependencies
```bash
npm i
```
5. Edit `monitor.js` and add your Infura Token, you staker address, your Telegram Bot token and the corresponding Chat ID.
6. Add the monitor to the Cron scheduling by running `crontab -e`. Select you favourite editor and add the following line 
```
00 8 * * * node /YOUR/INSTALATION/PATH/monitor.js
```
