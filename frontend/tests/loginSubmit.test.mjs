import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// A real DOM form exercises requestSubmit, required/email validation and the
// submitted values; no production API or personal browser is involved.
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url:'http://localhost/' });
const saved = new Map();
for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLFormElement','FormData','Event','KeyboardEvent','IS_REACT_ACT_ENVIRONMENT']) {
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,key,{ configurable:true, writable:true, value:key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
}
const { default:React, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const path = fileURLToPath(new URL('../components/LoginPage.tsx',import.meta.url));
const built = await build({ entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'} });
const loaded = new Module(path);loaded.paths=Module._nodeModulePaths(fileURLToPath(new URL('../',import.meta.url)));loaded._compile(built.outputFiles[0].text,path);
const Login=loaded.exports.default;
const originalFetch=globalThis.fetch;
let root, calls, onLoginCalls, loginResponse;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function mount(preview=false) {
  calls=[];onLoginCalls=0;loginResponse=async()=>json({ok:true});
  globalThis.fetch=async(url,options={})=>{
    calls.push({url,options});
    if(url==='/api/v1/auth/status') return json({registration_open:true,registered:true,demo:false});
    if(url==='/api/v1/auth/login') return loginResponse();
    if(url==='/api/v1/auth/register') return json({recovery_key:'fictional-test-recovery-key'});
    if(url==='/api/v1/auth/confirm-recovery-key') return json({ok:true});
    throw Error('Unexpected request');
  };
  root=createRoot(document.getElementById('app'));
  await act(async()=>root.render(React.createElement(Login,{preview,onLogin:()=>{onLoginCalls++;}})));
}
function autofill(id,value) {
  // Intentionally no React change/input event, as with some password managers.
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(document.getElementById(id),value);
}
function passwordKey(options={}) {
  const event=new dom.window.KeyboardEvent('keydown',{ key:'Enter',code:'Enter',bubbles:true,cancelable:true,...options });
  document.getElementById('login-password').dispatchEvent(event);
}
const loginCalls=()=>calls.filter(call=>call.url==='/api/v1/auth/login');
afterEach(async()=>{if(root) {await act(async()=>root.unmount());root=null;}globalThis.fetch=originalFetch;});
after(()=>{dom.window.close();for(const [key,descriptor] of saved) {if(descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

test('password Enter submits once with the current autofilled email and unchanged password',async()=>{
  await mount();autofill('login-email','person@example.test');autofill('login-password',' p@ss + word ');
  await act(async()=>passwordKey());
  assert.equal(loginCalls().length,1);assert.equal(onLoginCalls,1);
  const values=new URLSearchParams(loginCalls()[0].options.body);
  assert.equal(values.get('username'),'person@example.test');assert.equal(values.get('password'),' p@ss + word ');
});
test('Sign In click uses the same current form values and submission path',async()=>{
  await mount();autofill('login-email','person@example.test');autofill('login-password','secret-test');
  await act(async()=>document.querySelector('button[type=submit]').click());
  assert.equal(loginCalls().length,1);assert.equal(onLoginCalls,1);
  assert.equal(new URLSearchParams(loginCalls()[0].options.body).get('password'),'secret-test');
});
test('Enter respects required fields and email validity without contacting login',async()=>{
  await mount();autofill('login-password','secret-test');
  await act(async()=>passwordKey());assert.equal(loginCalls().length,0);
  autofill('login-email','invalid-email');
  await act(async()=>passwordKey());assert.equal(loginCalls().length,0);
  autofill('login-email','valid@example.test');autofill('login-password','');
  await act(async()=>passwordKey());assert.equal(loginCalls().length,0);
});
test('pending requests and held Enter do not send duplicate login attempts',async()=>{
  await mount();autofill('login-email','person@example.test');autofill('login-password','secret-test');
  let finish;
  loginResponse=()=>new Promise(resolve=>{finish=resolve;});
  await act(async()=>{passwordKey();passwordKey();});
  assert.equal(loginCalls().length,1);assert.equal(document.querySelector('button[type=submit]').disabled,true);
  await act(async()=>finish(json({detail:'Incorrect email or password'},401)));
  await act(async()=>passwordKey({repeat:true}));
  assert.equal(loginCalls().length,1);assert.equal(onLoginCalls,0);
  assert.match(document.querySelector('[role=alert]').textContent,/Incorrect email or password/);
});
test('IME composition Enter does not attempt login',async()=>{
  await mount();autofill('login-email','person@example.test');autofill('login-password','secret-test');
  await act(async()=>{passwordKey({isComposing:true});passwordKey({keyCode:229});});
  assert.equal(loginCalls().length,0);
});
test('registration Enter validates invite and preserves recovery-key acknowledgement',async()=>{
  await mount();
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Create account').click());
  autofill('login-email','person@example.test');autofill('login-password','secret-test');
  await act(async()=>passwordKey());
  assert.equal(calls.filter(call=>call.url==='/api/v1/auth/register').length,0);
  autofill('login-invite','test-invite');await act(async()=>passwordKey());
  assert.equal(calls.filter(call=>call.url==='/api/v1/auth/register').length,1);
  assert.match(document.body.textContent,/Save your recovery key/);assert.equal(onLoginCalls,0);
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes("I've saved it")).click());
  assert.equal(onLoginCalls,1);
});
test('local design preview remains unable to submit login on Enter',async()=>{
  await mount(true);autofill('login-email','person@example.test');autofill('login-password','secret-test');
  await act(async()=>passwordKey());assert.equal(calls.length,0);assert.equal(onLoginCalls,0);
  assert.equal(document.querySelector('button[type=submit]').disabled,true);
});
