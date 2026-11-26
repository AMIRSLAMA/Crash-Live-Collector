(()=>{const CAPTURE_VERSION="0.3.3";if(window.__crashFlightCaptureInstalled===CAPTURE_VERSION)return;window.__crashFlightCaptureInstalled=CAPTURE_VERSION;
 const TARGETS=new Set(["OnStage","OnBetting","OnStart","OnCrash","OnBets","OnProfits"]);
 const RELEVANT=/(round|crash|bet|start|stage|tick|coef|mult|update|state|progress|fly|game|factor|rate|speed)/i;
 const METRIC_KEY=/(multiplier|(^|[_-])mult([_-]|$)|coef|coefficient|factor|crash|elapsed|duration|time|stage|level|rate|speed|progress|round|tick|state|result|^f$|^x$)/i;
 function extractMetrics(value,out,depth=0){
  if(depth>6||value==null)return;
  if(Array.isArray(value)){for(const item of value.slice(0,50))extractMetrics(item,out,depth+1);return;}
  if(typeof value!=="object")return;
  for(const [key,val] of Object.entries(value).slice(0,100)){
   if(METRIC_KEY.test(key)&&(typeof val==="number"&&Number.isFinite(val))){
    out[key]=val;
   }else if(val&&typeof val==="object")extractMetrics(val,out,depth+1);
  }
 }
 function collectNumericPaths(value,out,path="$",depth=0){
  if(depth>7||out.length>=160||value==null)return;
  if(typeof value==="number"&&Number.isFinite(value)){out.push({path:path.slice(0,180),value});return;}
  if(Array.isArray(value)){for(let i=0;i<Math.min(value.length,40);i++)collectNumericPaths(value[i],out,path+"["+i+"]",depth+1);return;}
  if(typeof value==="object"){
   for(const [key,val] of Object.entries(value).slice(0,80)){
    const safe=String(key).replace(/[^a-zA-Z0-9_$-]/g,"_").slice(0,48);
    collectNumericPaths(val,out,path+"."+safe,depth+1);
    if(out.length>=160)break;
   }
  }
 }
 function describeShape(value,out,path="$",depth=0){
  if(depth>5||out.length>=120||value==null)return;
  if(Array.isArray(value)){out.push(path+":array["+Math.min(value.length,100)+"]");for(let i=0;i<Math.min(value.length,12);i++)describeShape(value[i],out,path+"["+i+"]",depth+1);return;}
  if(typeof value!=="object"){out.push(path+":"+typeof value);return;}
  for(const [key,val] of Object.entries(value).slice(0,60)){
   const safeKey=String(key).replace(/[^a-zA-Z0-9_$-]/g,"_").slice(0,40);
   describeShape(val,out,path+"."+safeKey,depth+1);
   if(out.length>=120)break;
  }
 }
 function handle(raw){
  if(typeof raw!=="string")return;
  for(const part of raw.split("\x1e")){
   if(!part)continue;let obj;try{obj=JSON.parse(part)}catch{continue}
   const messages=Array.isArray(obj)?obj:[obj];
   for(const m of messages){
    if(!m||typeof m!=="object"||m.type!==1||typeof m.target!=="string")continue;
    const target=m.target;
    const args=Array.isArray(m.arguments)?m.arguments:[];
    if(!TARGETS.has(target)&&!RELEVANT.test(target))continue;
    const metrics={};extractMetrics(args,metrics);extractMetrics(m,metrics);
    const shape=[];describeShape(args,shape);
    const numericPaths=[];collectNumericPaths(args,numericPaths);const event={target,argCount:args.length,metrics,shape,numericPaths,captureVersion:CAPTURE_VERSION};
    const payload=args.find(a=>a&&typeof a==="object")||{};
    if(target==="OnProfits"&&Array.isArray(payload.q)){
     payload.q.slice(0,20).forEach((point,index)=>{
      if(!point||typeof point!=="object")return;
      for(const axis of ["u","v"]){
       const value=point[axis];
       if(typeof value==="number"&&Number.isFinite(value))metrics["profitPoint"+index+axis.toUpperCase()]=value;
      }
     });
    }
    for(const key of ["l","ln","ts"]){const val=payload[key]??m[key];if(typeof val==="number"&&Number.isFinite(val))event[key]=val;else if(key==="l"&&typeof val==="string"&&val.length<60)event[key]=val;}
    if(target==="OnCrash"){
     const direct=payload.f??payload.multiplier??payload.mult??payload.coef??payload.coefficient??payload.factor??m.f;
     if(typeof direct==="number"&&Number.isFinite(direct))event.f=direct;
     else if(typeof args[0]==="number"&&Number.isFinite(args[0]))event.f=args[0];
     else {
      const keys=["f","multiplier","mult","coef","coefficient","factor","crash"];
      for(const key of keys){const value=metrics[key];if(typeof value==="number"&&Number.isFinite(value)){event.f=value;break;}}
     }
    }
    window.postMessage({source:"crash-flight-pro-capture",event},"*");
   }
  }
 }
 function handleBinary(data){
  try{const bytes=new Uint8Array(data);let offset=0,length=0,shift=0;
   while(offset<bytes.length&&shift<=28){const b=bytes[offset++];length|=(b&127)<<shift;if(!(b&128))break;shift+=7;}
   if(length>0&&offset+length<=bytes.length){handle(new TextDecoder().decode(bytes.subarray(offset,offset+length)));return;}
   handle(new TextDecoder().decode(bytes));
  }catch(_){}
 }
 const Native=window.WebSocket;if(typeof Native!=="function")return;
 function reportTransport(kind,byteLength){
  window.postMessage({source:"crash-flight-pro-capture",event:{kind:"transport",target:"__transport__",transportType:kind,byteLength:Number.isFinite(byteLength)?byteLength:0}},"*");
 }
 class ObservedWebSocket extends Native{
  constructor(...args){super(...args);reportTransport("websocket-open",0);this.addEventListener("message",e=>{
   if(typeof e.data==="string"){handle(e.data);}
   else if(e.data instanceof ArrayBuffer){handleBinary(e.data);}
   else if(typeof Blob!=="undefined"&&e.data instanceof Blob){e.data.arrayBuffer().then(handleBinary).catch(()=>{});}
  });}
 }
 Object.defineProperty(ObservedWebSocket,"name",{value:"WebSocket"});
 window.WebSocket=ObservedWebSocket;
})();