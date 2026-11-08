chrome.runtime.sendMessage({action:'status'}).then(s=>document.querySelector('#state').textContent=JSON.stringify(s,null,2));
document.querySelector('#stop').onclick=()=>chrome.runtime.sendMessage({action:'stop'}).then(()=>window.close());
