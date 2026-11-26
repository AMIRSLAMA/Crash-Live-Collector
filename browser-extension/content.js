window.addEventListener("message",event=>{
 if(event.source!==window||event.data?.source!=="crash-flight-pro-capture")return;
 chrome.runtime.sendMessage({type:"crash-flight-event",event:event.data.event}).catch(()=>{});
});