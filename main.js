"use strict"
//process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
process.on('uncaughtException', console.error)
import "./settings.js"
const {Browsers,
makeInMemoryStore,
useMultiFileAuthState,
makeCacheableSignalKeyStore,
MessageRetryMap,
fetchLatestBaileysVersion
} = (await import('baileys')).default
import fs from "fs"
import logg from 'pino'
import {Socket, smsg} from './lib/simple.js'
import {ciyoBot} from './message/ciyo.js'
import _ from 'lodash'
import CFonts from 'cfonts'
import path  from 'path'
import chalkAnimation from 'chalk-animation'
import {memberUpdate,groupsUpdate } from "./message/group.js"
import {connect} from "./server.js"
import { antiCall } from "./message/anticall.js"
import {connectionUpdate} from "./message/connection.js"
import HttpProxyAgent from 'http-proxy-agent'
const PORT = process.env.PORT || 3000   
const proxy = process.env.http_proxy || 'http://168.63.76.32:3128';

//delete tmp
setInterval(() => {
fs.readdir('./database', async function (err, files) {
let tmpFile = await files.filter(item => item.endsWith(".tmp"))
if(tmpFile.length > 0){
console.log("Sedang menghapus tmp file..")
await tmpFile.forEach(function (file) {
fs.unlinkSync(`./database/${file}`)
});
console.log("File tmp telah dibersihkan!")
}
})
}, 10_000)

//auto delete trash
setInterval(() => {
let directoryPath = path.join();
fs.readdir(directoryPath, async function (err, files) {
var filteredArray = await files.filter(item =>
item.endsWith("gif") ||
item.endsWith("png") || 
item.endsWith("mp3") ||
item.endsWith("mp4") || 
item.endsWith("jpg") ||
item.endsWith("webp") ||
item.endsWith("webm") ||
item.endsWith("zip") 
)
if(filteredArray.length > 0){
let teks =`Terdeteksi ${filteredArray.length} file sampah`
console.log(teks)
setInterval(() => {
if(filteredArray.length == 0) return console.log("File sampah telah dibersihkan!")
filteredArray.forEach(function (file) {
let sampah = fs.existsSync(file)
if(sampah) fs.unlinkSync(file)
})
}, 15_000)
}
});
}, 30_000)
//load plugins

    CFonts.say(`CiyoMD`, {
        font: 'shade',
        align: 'center',
        gradient: ['#12c2e9', '#c471ed'],
        transitionGradient: true,
        letterSpacing: 3,
    });
    CFonts.say(`By RhmttCore`, {
        font: 'console',
        align: 'center',
        gradient: ['#DCE35B', '#45B649'],
        transitionGradient: true,
    });
    
/*
CFonts.say('CiyoMD', {
font: 'chrome',
align: 'left',
gradient: ['red', 'magenta']
})
 */
setTimeout(() => {
chalkAnimation.rainbow('ciyobot').start(); //animation resumes
}, 2000);

//connect to whatsApp
const connectToWhatsApp = async () => {
await(await import("./message/database.js")).default()

//update runtime in db
setInterval(() => {
let data = global.db.data.others['runtime']
if(data){ 
if((new Date - data.lastTime) > (60000*60)){
data.runtime = + new Date
data.lastTime = + new Date
console.log("Runtime di perbarui.")
} else data.lastTime = + new Date
} else{ global.db.data.others['runtime'] = {
runtime: + new Date,
lastTime: + new Date
}
console.log("New update runtime.")
}
},60_000)

const { state, saveCreds } = await useMultiFileAuthState("session")
const store = makeInMemoryStore({ logger: logg().child({ level: 'fatal', stream: 'store' }) }) 
const { version, isLatest } = await fetchLatestBaileysVersion()

//fix button
const patchMessageBeforeSending = (message) => {
const requiresPatch = !!(
message.buttonsMessage ||
message.listMessage || 
message.templateMessage
);
if (requiresPatch) {
message = {
viewOnceMessage: {
message: {
messageContextInfo: {   
deviceListMetadataVersion: 2,  
deviceListMetadata: {},
},
...message,
},
},
};
}
return message
}

//fix pending chat bot
const getMessage = async (key) => {
if(store) {
const msg = await store.loadMessage(key.remoteJid, key.id, undefined)
return msg?.message || undefined
}
return {
conversation: 'hallo'
}
}

//save session
const auth = {
creds: state.creds,
/** caching makes the store faster to send/recv messages */
keys: makeCacheableSignalKeyStore(state.keys, logg().child({ level: 'fatal', stream: 'store' })),
}

//connection
const connectionOptions = {
version,
printQRInTerminal: true,
logger: logg({ level: 'fatal' }),
auth,
patchMessageBeforeSending,
getMessage,
MessageRetryMap,
//agent? :new HttpProxyAgent(proxy),
browser: Browsers.macOS('Desktop'),
keepAliveIntervalMs: 20000,
defaultQueryTimeoutMs: 20000,
connectTimeoutMs: 30000,
emitOwnEvents: true,
fireInitQueries: true,
generateHighQualityLinkPreview: true,
syncFullHistory: true,
markOnlineOnConnect: true,
}

global.conn = Socket(connectionOptions)
connect(conn, PORT)
store.bind(conn.ev)
//conn.waVersion = version

conn.ev.process(async(events) => {

//connection update
if(events['connection.update']) {
if (db.data == null) await loadDatabase()
const update = events['connection.update']
await connectionUpdate(connectToWhatsApp,conn,update)
}

//credentials updated -- save them
if(events['creds.update']) { await saveCreds() }

//history received
if(events['messaging-history.set']) {
const { chats, contacts, messages, isLatest } = events['messaging-history.set']
console.log(`History: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest})`)
}
  
//received a new message
if(events['messages.upsert']) {
const chatUpdate = events['messages.upsert']
if (global.db.data) await global.db.write() 
if (!chatUpdate.messages) return;
let m = chatUpdate.messages[0] || chatUpdate.messages[chatUpdate.messages.length - 1]
if (!m.message) return
if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return
m = await smsg(conn, m, store) 
ciyoBot(conn, m, chatUpdate,store)
}
  
//anti call
if(events.call) {
const node = events.call
antiCall(db,node, conn)
}

//member update  
if(events['group-participants.update']) {
const anu = events['group-participants.update']
if (global.db.data == null) await loadDatabase()
memberUpdate(conn,anu)
}

//group update  
if(events['groups.update']) {
const anu = events['groups.update']
groupsUpdate(conn,anu)
}

})
  
const toFirstCase = (str) =>{
let first = str.split(" ")              //cut space name
.map(nama => 
nama.charAt(0).toUpperCase() + 
nama.slice(1))                 //change capital font in first word
.join(" ");

return first
 }

 const Log = (text) =>{
 console.log(text)
 }
 
let d = new Date
let locale = 'id'
let gmt = new Date(0).getTime() - new Date('1 Januari 2021').getTime()
let week = d.toLocaleDateString(locale, { weekday: 'long' })
const calender = d.toLocaleDateString("id", {
day: 'numeric',
month: 'long',
year: 'numeric'
})

function clockString(ms) {
let d = isNaN(ms) ? '--' : Math.floor(ms / 86400000)
let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000) % 24
let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
let dDisplay = d > 0 ? d +  " hari, ": "";
let hDisplay = h > 0 ? h +  " jam, " : "";
let mDisplay = m > 0 ? m +  " menit, " : "";
let sDisplay = s > 0 ? s +  " detik" : "";
let time = d > 0 ? dDisplay + hDisplay + mDisplay  : hDisplay + mDisplay + sDisplay
return time
}

function tmp(file) {
return file+".tmp"
}

global.tmp = tmp
global.clockString = clockString
global.week = week
global.calender = calender  
global.Log = Log
global.toFirstCase = toFirstCase
//global.webUrl =  db.data.settings["webUrl"]? db.data.settings["webUrl"].link : webImg
return conn
 }

connectToWhatsApp()