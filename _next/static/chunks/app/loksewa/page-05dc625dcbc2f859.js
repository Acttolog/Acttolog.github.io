(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[8547],{786:(e,t,r)=>{Promise.resolve().then(r.t.bind(r,8500,23)),Promise.resolve().then(r.bind(r,7270)),Promise.resolve().then(r.bind(r,121)),Promise.resolve().then(r.bind(r,5910)),Promise.resolve().then(r.bind(r,804))},5910:(e,t,r)=>{"use strict";r.d(t,{Stage3D:()=>c});var n=r(5155),o=r(2115),i=r(5911),a=r(3018),s=r(6645),l=r(121);function c({stages:e}){let t=(0,o.useRef)(null),{medium:r}=(0,l.R)();return(0,o.useEffect)(()=>{let e=t.current;if(!e||(0,s.yj)())return;i.Ay.registerPlugin(a.u);let r=i.Ay.utils.toArray(".lkslab",e),n=i.Ay.context(()=>{i.Ay.fromTo(r,{y:()=>i.Ay.utils.random(-140,140),z:()=>i.Ay.utils.random(-520,120),rotateX:-26,opacity:.15},{y:0,z:e=>-(26*e),rotateX:-14,opacity:1,ease:"none",stagger:.02,scrollTrigger:{trigger:e,start:"top 88%",end:"bottom 40%",scrub:.7}})},e);return()=>n.revert()},[]),(0,n.jsxs)("div",{className:"lkstage",ref:t,"aria-label":"चयन चरणहरू / Selection stages",children:[(0,n.jsx)("div",{className:"lkstage-scene",children:e.map(e=>(0,n.jsxs)("div",{className:"lkslab","data-kind":e.kind.ne.length>0?e.id:"",style:{"--w":`${Math.max(38,100-8*e.order)}%`},children:[(0,n.jsx)("span",{className:"lkslab-order mono",children:String(e.order).padStart(2,"0")}),(0,n.jsxs)("span",{className:"lkslab-body",children:[(0,n.jsx)(l.Lk,{v:e.title,as:"span",className:"lkslab-title"}),(0,n.jsxs)("span",{className:"lkslab-meta",children:[e.marks," ","en"===r?"marks":"अङ्क",e.negative>0&&(0,n.jsxs)("em",{className:"lkslab-neg",children:["−",Math.round(100*e.negative),"% ","en"===r?"negative":"नकारात्मक"]})]})]})]},e.id))}),(0,n.jsx)("p",{className:"lkstage-note",children:"en"===r?"The pyramid is the strategy: everything above the first slab is unreachable until the objective gate is cleared.":"पिरामिड नै रणनीति हो: पहिलो तह पार नभएसम्म माथिको कुनै पनि तह पहुँचयोग्य छैन।"})]})}},6645:(e,t,r)=>{"use strict";r.d(t,{FxScene:()=>m,Ui:()=>f,Ut:()=>u,yj:()=>d});var n=r(5155),o=r(2115),i=r(5911),a=r(3018);let s=o.useLayoutEffect,l=!1;function c(){l||(i.Ay.registerPlugin(a.u),l=!0)}function d(){return window.matchMedia("(prefers-reduced-motion: reduce)").matches}function u(){(0,o.useEffect)(()=>{c();let e=document.documentElement,t=window.matchMedia("(prefers-reduced-motion: reduce)"),r=()=>e.classList.toggle("fx-on",!t.matches);return r(),t.addEventListener("change",r),()=>{t.removeEventListener("change",r),e.classList.remove("fx-on")}},[])}function f(e){s(()=>{let t=e.current;if(!t||d())return;c();let r=[],n=[];t.querySelectorAll('[data-fx~="tilt"]').forEach(e=>{e.classList.add("fx-tilt"),i.Ay.set(e,{transformPerspective:900});let t=i.Ay.quickTo(e,"rotationY",{duration:.5,ease:"power3.out"}),n=i.Ay.quickTo(e,"rotationX",{duration:.5,ease:"power3.out"}),o=i.Ay.quickTo(e,"z",{duration:.5,ease:"power3.out"}),a=r=>{let i=e.getBoundingClientRect(),a=(r.clientX-i.left)/i.width-.5,s=(r.clientY-i.top)/i.height-.5;t(22*a),n(-(17*s)),o(18),e.style.setProperty("--fx-mx",`${(a+.5)*100}%`),e.style.setProperty("--fx-my",`${(s+.5)*100}%`)},s=()=>{t(0),n(0),o(0)};e.addEventListener("pointermove",a),e.addEventListener("pointerleave",s),r.push(()=>{e.removeEventListener("pointermove",a),e.removeEventListener("pointerleave",s),i.Ay.killTweensOf(e)})}),t.querySelectorAll('[data-fx~="flip"]').forEach(e=>{if(e.getBoundingClientRect().top<.9*window.innerHeight)return;let t=i.Ay.context(()=>{let t=i.Ay.fromTo(e,{rotationY:-24,z:-110,transformPerspective:1100},{rotationY:24,z:0,transformPerspective:1100,ease:"none",scrollTrigger:{trigger:e,start:"top bottom",end:"bottom top",scrub:.6}});n.push({el:e,done:()=>t.progress(1)})});r.push(()=>t.revert())}),t.querySelectorAll('[data-fx~="scan"]').forEach(e=>{let t=e.querySelector("img");if(!t||e.getBoundingClientRect().top<.9*window.innerHeight)return;e.classList.add("fx-scan");let o=document.createElement("span");o.className="fx-scan-bar",o.setAttribute("aria-hidden","true"),e.appendChild(o),i.Ay.set(t,{clipPath:"inset(0 0 100% 0)"});let a=null,s=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(s.unobserve(e.target),a=i.Ay.to(t,{clipPath:"inset(0 0 0% 0)",duration:1.05,ease:"power2.inOut"}),i.Ay.fromTo(o,{opacity:1,top:"-2%"},{opacity:0,top:"102%",duration:1.05,ease:"power2.inOut"}))})},{threshold:.12,rootMargin:"0px 0px -8% 0px"});s.observe(e),n.push({el:e,done:()=>{s.disconnect(),a?a.progress(1):i.Ay.set(t,{clearProps:"clipPath"})}}),r.push(()=>{s.disconnect(),i.Ay.set(t,{clearProps:"clipPath"}),o.remove()})}),t.querySelectorAll("[data-plane]").forEach(e=>{let n=Number(e.dataset.plane)||0;if(!n)return;e.classList.add("fx-plane");let o=i.Ay.context(()=>{i.Ay.fromTo(e,{yPercent:-9*n},{yPercent:9*n,ease:"none",scrollTrigger:{trigger:t,start:"top bottom",end:"bottom top",scrub:!0}})});r.push(()=>o.revert())});let o=()=>{for(let e=n.length-1;e>=0;e-=1){let{el:t,done:r}=n[e];t.getBoundingClientRect().top>=.92*window.innerHeight||(r(),n.splice(e,1))}},s=!1,l=()=>{s||(s=!0,requestAnimationFrame(()=>{s=!1,o()}))},u=()=>{a.u.refresh(),o()},f=requestAnimationFrame(u);window.addEventListener("scroll",l,{passive:!0}),window.addEventListener("load",u,{once:!0});let m=window.setTimeout(u,1200);return()=>{cancelAnimationFrame(f),window.clearTimeout(m),window.removeEventListener("scroll",l),window.removeEventListener("load",u),r.forEach(e=>e())}},[e])}function m({children:e}){let t=(0,o.useRef)(null);return f(t),(0,n.jsx)("div",{ref:t,children:e})}},7270:(e,t,r)=>{"use strict";r.d(t,{AuroraGL:()=>l});var n=r(5155),o=r(2115),i=r(6645);let a=`#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // One oversized triangle covering the viewport — cheaper than a quad.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`,s=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uFade;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.3, -0.7);
    a *= 0.52;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * 2.0 - 1.0);
  p.x *= uRes.x / max(uRes.y, 1.0);

  float t = uTime * 0.035;
  vec2 drift = uPointer * 0.16;

  // Two slow, differently-scaled fields make the bands fold instead of scroll.
  float n = fbm(p * 1.9 + vec2(t * 0.6, -t * 0.35) + drift);
  float m = fbm(p * 3.4 - vec2(t * 0.45, t * 0.5) + n * 1.4);

  float band = smoothstep(0.28, 0.92, n) * (0.35 + 0.65 * m);
  float rim = pow(1.0 - abs(p.y * 0.7 + n * 0.55 - 0.25), 2.6);

  vec3 cyan = vec3(0.208, 0.878, 1.0);
  vec3 violet = vec3(0.486, 0.361, 1.0);
  vec3 pink = vec3(1.0, 0.306, 0.804);

  vec3 col = mix(violet, cyan, clamp(n * 1.5, 0.0, 1.0));
  col = mix(col, pink, smoothstep(0.55, 1.0, m) * 0.42);
  col *= band * 0.75 + rim * 0.32;

  // Keep the centre quiet so the headline and the globe stay readable.
  float quiet = smoothstep(0.05, 0.85, length(p * vec2(0.85, 1.0)));
  outColor = vec4(col * quiet * uFade, 1.0);
}`;function l({className:e=""}){let t=(0,o.useRef)(null);return(0,o.useEffect)(()=>{let e=t.current;if(!e||(0,i.yj)())return;let r=e.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,powerPreference:"low-power"});if(!r)return;let n=(e,t)=>{let n=r.createShader(e);if(!n)throw Error("shader alloc failed");if(r.shaderSource(n,t),r.compileShader(n),!r.getShaderParameter(n,r.COMPILE_STATUS)){let e=r.getShaderInfoLog(n);throw r.deleteShader(n),Error(e||"shader compile failed")}return n},o=null;try{if(o=r.createProgram(),r.attachShader(o,n(r.VERTEX_SHADER,a)),r.attachShader(o,n(r.FRAGMENT_SHADER,s)),r.linkProgram(o),!r.getProgramParameter(o,r.LINK_STATUS))throw Error(r.getProgramInfoLog(o)||"link failed")}catch{return}let l=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,l),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),r.STATIC_DRAW),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,0,0),r.useProgram(o);let c=r.getUniformLocation(o,"uRes"),d=r.getUniformLocation(o,"uTime"),u=r.getUniformLocation(o,"uPointer"),f=r.getUniformLocation(o,"uFade"),m={x:0,y:0},h={x:0,y:0},v=t=>{let r=e.getBoundingClientRect();h.x=(t.clientX-r.left)/r.width*2-1,h.y=(t.clientY-r.top)/r.height*2-1};window.addEventListener("pointermove",v,{passive:!0});let p=0,g=!0,y=()=>{let t=Math.min(window.devicePixelRatio||1,1.5),n=Math.round(e.clientWidth*t),o=Math.round(e.clientHeight*t);(e.width!==n||e.height!==o)&&(e.width=n,e.height=o,r.viewport(0,0,n,o))};y();let w=new ResizeObserver(y);w.observe(e);let x=performance.now(),b=()=>{p=requestAnimationFrame(b),!g||r.isContextLost()||(m.x+=(h.x-m.x)*.045,m.y+=(h.y-m.y)*.045,r.uniform2f(c,e.width,e.height),r.uniform1f(d,(performance.now()-x)/1e3),r.uniform2f(u,m.x,m.y),r.uniform1f(f,.85),r.drawArrays(r.TRIANGLES,0,3))};p=requestAnimationFrame(b);let A=()=>{g="hidden"!==document.visibilityState};return document.addEventListener("visibilitychange",A),()=>{cancelAnimationFrame(p),w.disconnect(),document.removeEventListener("visibilitychange",A),window.removeEventListener("pointermove",v),r.deleteProgram(o),r.deleteBuffer(l);let e=r.getExtension("WEBGL_lose_context");e?.loseContext()}},[]),(0,n.jsx)("canvas",{ref:t,className:`aurora-gl ${e}`,"aria-hidden":"true"})}}},e=>{e.O(0,[5592,8500,50,9340,8441,3794,7358],()=>e(e.s=786)),_N_E=e.O()}]);