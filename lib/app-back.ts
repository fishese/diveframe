declare global {
  interface Window {
    __diveFrameHandleBack?: () => boolean;
    __diveFrameBack?: {
      handle: () => boolean;
      parent?: (pathname: string, search: string) => string | null;
    };
  }
}

export function normalizeAppPath(pathname: string): string {
  if (!pathname) return "/";
  if (pathname === "/index.html" || pathname === "/index") return "/";
  let path = pathname.endsWith(".html") ? pathname.slice(0, -5) : pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

export function appBackParent(pathname: string, search: string): string | null {
  const path = normalizeAppPath(pathname);
  const query = search.startsWith("?") ? search.slice(1) : search;
  const dive = new URLSearchParams(query).get("dive");

  if (path === "/compose") {
    return dive ? `/?dive=${encodeURIComponent(dive)}` : "/";
  }
  if (path === "/catalog/supplement" || path === "/catalog/device-additions") {
    return "/catalog";
  }
  if (path === "/") {
    return dive ? "/" : null;
  }
  return "/";
}

export function appBackHrefForLocation(
  parentHref: string,
  livePathname: string,
): string {
  if (!livePathname.endsWith(".html")) return parentHref;
  return appendNativeHtml(parentHref);
}

function appendNativeHtml(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const suffixStart = href.search(/[?#]/);
  const pathname = suffixStart === -1 ? href : href.slice(0, suffixStart);
  const queryOrHash = suffixStart === -1 ? "" : href.slice(suffixStart);
  if (
    pathname === "/" ||
    pathname.endsWith("/") ||
    pathname.endsWith(".html") ||
    /\/[^/]+\.[^/]+$/.test(pathname)
  ) {
    return href;
  }
  return `${pathname}.html${queryOrHash}`;
}

/**
 * Inline head script: hierarchical Back before React hydrates.
 * Must stay aligned with appBackParent / appBackHrefForLocation.
 */
export const APP_BACK_BOOTSTRAP = `(function(){try{
var w=window;
if(!w||!w.location||!w.history)return;
function normalizeAppPath(pathname){
  if(!pathname)return "/";
  if(pathname==="/index.html"||pathname==="/index")return "/";
  var path=pathname.length>5&&pathname.slice(-5)===".html"?pathname.slice(0,-5):pathname;
  if(path.length>1&&path.slice(-1)==="/")path=path.slice(0,-1);
  return path||"/";
}
function appBackParent(pathname,search){
  var path=normalizeAppPath(pathname);
  var query=String(search||"");
  if(query.charAt(0)==="?")query=query.slice(1);
  var dive=null;
  query.split("&").forEach(function(part){
    if(!part)return;
    var i=part.indexOf("=");
    var key=i===-1?part:part.slice(0,i);
    if(key!=="dive")return;
    var raw=i===-1?"":part.slice(i+1);
    try{dive=decodeURIComponent(raw.replace(/\\+/g," "));}catch(e){dive=raw;}
  });
  if(path==="/compose")return dive?"/?dive="+encodeURIComponent(dive):"/";
  if(path==="/catalog/supplement"||path==="/catalog/device-additions")return "/catalog";
  if(path==="/")return dive?"/":null;
  return "/";
}
function appBackHrefForLocation(parentHref,livePathname){
  if(!livePathname||livePathname.slice(-5)!==".html")return parentHref;
  if(!parentHref||parentHref.charAt(0)!=="/"||parentHref.indexOf("//")===0)return parentHref;
  var suffixStart=parentHref.search(/[?#]/);
  var pathname=suffixStart===-1?parentHref:parentHref.slice(0,suffixStart);
  var queryOrHash=suffixStart===-1?"":parentHref.slice(suffixStart);
  if(pathname==="/"||pathname.slice(-1)==="/"||pathname.slice(-5)===".html")return parentHref;
  return pathname+".html"+queryOrHash;
}
function currentParent(){
  return appBackParent(w.location.pathname,w.location.search||"");
}
function handleBack(){
  var parent=currentParent();
  if(parent==null)return false;
  var href=appBackHrefForLocation(parent,w.location.pathname);
  w.location.replace(href);
  return true;
}
var back=w.__diveFrameBack||{};
back.parent=appBackParent;
back.handle=handleBack;
w.__diveFrameBack=back;
w.__diveFrameHandleBack=function(){
  try{return !!(w.__diveFrameBack&&w.__diveFrameBack.handle&&w.__diveFrameBack.handle());}
  catch(e){return false;}
};
function arm(){
  if(currentParent()==null)return;
  if(w.history.state&&w.history.state.__diveframeBack)return;
  w.history.pushState({__diveframeBack:1},"",w.location.href);
}
w.addEventListener("popstate",function(){
  try{w.__diveFrameHandleBack();}catch(e){}
  try{arm();}catch(e){}
});
arm();
}catch(e){}})();`;
