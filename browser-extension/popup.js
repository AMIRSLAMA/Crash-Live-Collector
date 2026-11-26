const status=document.getElementById("status");const KEY="crashFlightEvents";
document.getElementById("start").onclick=async()=>{
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https:\/\//.test(tab.url||""))throw Error("افتح صفحة اللعبة HTTPS أولًا");
  const host=new URL(tab.url).hostname;
  if(!/(^|\.)(1xbet\.com|eg1xbet\.com|1xlite-11151\.pro)$/.test(host))throw Error("التسجيل متاح فقط على صفحة اللعبة");
  await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["inject.js"],world:"MAIN"});
  await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:["content.js"],world:"ISOLATED"});
  status.textContent="تم تفعيل التسجيل. الإضافة تراقب اتصال اللعبة تلقائيًا من بداية تحميل الصفحة؛ أعد تحميل صفحة اللعبة بعد تثبيت التحديث.";
 }catch(e){status.textContent="خطأ: "+e.message}
};
document.getElementById("export").onclick=async()=>{
 const data=await chrome.storage.local.get({[KEY]:[]});const rows=data[KEY];
 if(!rows.length){status.textContent="مفيش رسائل مسجلة لسه";return}
 const text=rows.map(x=>JSON.stringify(x)).join("\n")+"\n";
 const url="data:application/x-ndjson;charset=utf-8,"+encodeURIComponent(text);
 await chrome.downloads.download({url,filename:"crash-flight-events.jsonl",saveAs:true});
 status.textContent="تم تجهيز "+rows.length+" رسالة للتصدير";
};
document.getElementById("clear").onclick=async()=>{await chrome.storage.local.set({[KEY]:[]});status.textContent="تم المسح"};
