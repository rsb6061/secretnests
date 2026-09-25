const enc = new TextEncoder();

function b64url(bytes){
  let binary="";
  for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
}
function decodeB64url(value){
  const raw=String(value||"");
  const base64=raw.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-raw.length%4)%4);
  const binary=atob(base64);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function randomToken(bytes=32){
  const out=new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return b64url(out);
}
async function sha256Bytes(text){
  return new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text)));
}
async function sha256Hex(text){
  return [...await sha256Bytes(text)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function parseCookies(request){
  const out={};
  for(const part of String(request.headers.get("cookie")||"").split(";")){
    const at=part.indexOf("=");
    if(at<=0)continue;
    out[part.slice(0,at).trim()]=decodeURIComponent(part.slice(at+1).trim());
  }
  return out;
}
function sessionCookie(value,maxAge){
  return ["sn_session="+encodeURIComponent(value),"Path=/","HttpOnly","Secure","SameSite=Lax","Max-Age="+maxAge].join("; ");
}
function safeReturn(value){
  const s=String(value||"/");
  if(!s.startsWith("/")||s.startsWith("//")||s.includes("\n")||s.includes("\r"))return "/";
  return s.slice(0,1200);
}
function authDomain(env){
  return String(env.AUTH0_LOGIN_DOMAIN||env.AUTH0_DOMAIN||"").trim().replace(/^https?:\/\//,"").replace(/\/$/,"");
}
export function authConfigured(env){
  return String(env.AUTH_MODE||"").toLowerCase()==="auth0"&&Boolean(authDomain(env)&&env.AUTH0_CLIENT_ID&&env.AUTH0_CLIENT_SECRET);
}
function cleanHandle(v=""){
  return String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32)||"traveler";
}
async function uniqueHandle(db,base){
  const stem=cleanHandle(base);
  for(let i=0;i<100;i++){
    const suffix=i===0?"":"-"+(i+1);
    const candidate=stem.slice(0,32-suffix.length)+suffix;
    const hit=await db.prepare("SELECT id FROM creator_profiles WHERE lower(handle)=lower(?) LIMIT 1").bind(candidate).first();
    if(!hit)return candidate;
  }
  return stem.slice(0,24)+"-"+randomToken(4).toLowerCase();
}
async function verifyIdToken(idToken,domain,clientId,nonce){
  const parts=String(idToken||"").split(".");
  if(parts.length!==3)throw new Error("invalid_id_token");
  let header,payload;
  try{
    header=JSON.parse(new TextDecoder().decode(decodeB64url(parts[0])));
    payload=JSON.parse(new TextDecoder().decode(decodeB64url(parts[1])));
  }catch{
    throw new Error("invalid_id_token_payload");
  }
  if(header.alg!=="RS256"||!header.kid)throw new Error("unsupported_id_token");
  const jwksRes=await fetch("https://"+domain+"/.well-known/jwks.json");
  if(!jwksRes.ok)throw new Error("jwks_fetch_failed");
  const jwks=await jwksRes.json();
  const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid&&k.kty==="RSA");
  if(!jwk)throw new Error("jwks_key_not_found");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decodeB64url(parts[2]),enc.encode(parts[0]+"."+parts[1]));
  if(!valid)throw new Error("invalid_id_token_signature");
  const now=Math.floor(Date.now()/1000);
  const issuer="https://"+domain+"/";
  const audience=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(payload.iss!==issuer||!audience.includes(clientId)||Number(payload.exp||0)<=now||payload.nonce!==nonce)throw new Error("invalid_id_token_claims");
  return payload;
}

export async function currentCreator(request,env){
  const raw=parseCookies(request).sn_session;
  if(!raw||!env.DB)return null;
  const hash=await sha256Hex(raw);
  const now=new Date().toISOString();
  const sql=[
    "SELECT cp.id creator_id,cp.handle,cp.display_name,cp.avatar_url,cp.is_public,",
    "ai.id auth_identity_id,ai.email,ai.email_verified,s.id session_id,s.expires_at",
    "FROM sessions s",
    "JOIN auth_identities ai ON ai.id=s.auth_identity_id",
    "JOIN creator_profiles cp ON cp.id=ai.creator_id",
    "WHERE s.token_hash=? AND s.expires_at>? LIMIT 1"
  ].join(" ");
  const row=await env.DB.prepare(sql).bind(hash,now).first();
  if(!row)return null;
  env.DB.prepare("UPDATE sessions SET last_seen_at=? WHERE id=?").bind(now,row.session_id).run().catch(()=>{});
  return row;
}

export async function beginAuth(request,env,origin){
  if(!authConfigured(env)){
    return new Response("Sign in is not configured yet.",{status:503,headers:{"content-type":"text/plain; charset=utf-8"}});
  }
  const url=new URL(request.url),domain=authDomain(env);
  const state=randomToken(24),verifier=randomToken(48),nonce=randomToken(24);
  const challenge=b64url(await sha256Bytes(verifier));
  const returnTo=safeReturn(url.searchParams.get("return_to")||"/");
  const popup=url.searchParams.get("popup")==="1";
  const expires=new Date(Date.now()+10*60*1000).toISOString();
  await env.DB.prepare("DELETE FROM auth_login_states WHERE expires_at<?").bind(new Date().toISOString()).run().catch(()=>{});
  await env.DB.prepare("INSERT INTO auth_login_states (state,code_verifier,nonce,return_to,popup,expires_at,created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(state,verifier,nonce,returnTo,popup?1:0,expires,new Date().toISOString()).run();
  const callback=origin+"/auth/callback";
  const authorize=new URL("https://"+domain+"/authorize");
  authorize.searchParams.set("response_type","code");
  authorize.searchParams.set("client_id",env.AUTH0_CLIENT_ID);
  authorize.searchParams.set("redirect_uri",callback);
  authorize.searchParams.set("scope","openid profile email");
  authorize.searchParams.set("state",state);
  authorize.searchParams.set("nonce",nonce);
  authorize.searchParams.set("code_challenge",challenge);
  authorize.searchParams.set("code_challenge_method","S256");
  const connection=String(env.AUTH0_CONNECTION||"google-oauth2").trim();
  if(connection&&connection!=="universal")authorize.searchParams.set("connection",connection);
  return Response.redirect(authorize.toString(),302);
}

export async function finishAuth(request,env,origin){
  if(!authConfigured(env))return new Response("Sign in is not configured yet.",{status:503});
  const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state");
  if(!code||!state)return new Response("Invalid sign-in callback.",{status:400});
  const login=await env.DB.prepare("SELECT * FROM auth_login_states WHERE state=? AND expires_at>? LIMIT 1").bind(state,new Date().toISOString()).first();
  if(!login)return new Response("This sign-in attempt expired. Please try again.",{status:400});
  await env.DB.prepare("DELETE FROM auth_login_states WHERE state=?").bind(state).run().catch(()=>{});
  const domain=authDomain(env),callback=origin+"/auth/callback";
  const tokenRes=await fetch("https://"+domain+"/oauth/token",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      grant_type:"authorization_code",
      client_id:env.AUTH0_CLIENT_ID,
      client_secret:env.AUTH0_CLIENT_SECRET,
      code,
      code_verifier:login.code_verifier,
      redirect_uri:callback
    })
  });
  let tokens={};
  try{tokens=await tokenRes.json()}catch{}
  if(!tokenRes.ok||!tokens.access_token||!tokens.id_token)return new Response("Sign in failed during token exchange.",{status:400});
  let claims;
  try{claims=await verifyIdToken(tokens.id_token,domain,env.AUTH0_CLIENT_ID,login.nonce)}catch{return new Response("Sign in could not be verified.",{status:400})}
  const userRes=await fetch("https://"+domain+"/userinfo",{headers:{authorization:"Bearer "+tokens.access_token}});
  let profile={};
  try{profile=await userRes.json()}catch{}
  if(!userRes.ok||!profile.sub)return new Response("Sign in profile lookup failed.",{status:400});
  if(profile.sub!==claims.sub)return new Response("Sign in identity mismatch.",{status:400});
  const email=String(profile.email||claims.email||"").trim().toLowerCase()||null;
  const verified=(profile.email_verified??claims.email_verified)?1:0;
  const displayName=String(profile.name||profile.nickname||(email?email.split("@")[0]:"Traveler")).trim().slice(0,120);
  const avatar=String(profile.picture||"").trim().slice(0,1000)||null;

  let identity=await env.DB.prepare("SELECT * FROM auth_identities WHERE provider='auth0' AND provider_subject=? LIMIT 1").bind(profile.sub).first();
  let creatorId=identity?.creator_id||null;
  if(!creatorId){
    const existing=await env.DB.prepare("SELECT id FROM creator_profiles WHERE user_id=? LIMIT 1").bind(profile.sub).first();
    creatorId=existing?.id||null;
  }
  if(!creatorId){
    creatorId=crypto.randomUUID();
    const handle=await uniqueHandle(env.DB,profile.nickname||profile.given_name||(email?email.split("@")[0]:displayName));
    await env.DB.prepare("INSERT INTO creator_profiles (id,user_id,handle,display_name,bio,avatar_url,taste_profile_json,is_public,created_at,updated_at) VALUES (?,?,?,?,?,?,'[]',1,?,?)")
      .bind(creatorId,profile.sub,handle,displayName,null,avatar,new Date().toISOString(),new Date().toISOString()).run();
  }else{
    await env.DB.prepare("UPDATE creator_profiles SET display_name=?,avatar_url=COALESCE(?,avatar_url),user_id=COALESCE(user_id,?),updated_at=? WHERE id=?")
      .bind(displayName,avatar,profile.sub,new Date().toISOString(),creatorId).run();
  }

  const identityId=identity?.id||crypto.randomUUID();
  await env.DB.prepare("INSERT INTO auth_identities (id,provider,provider_subject,email,email_verified,creator_id,created_at,updated_at) VALUES (?,'auth0',?,?,?,?,?,?) ON CONFLICT(provider,provider_subject) DO UPDATE SET email=excluded.email,email_verified=excluded.email_verified,creator_id=excluded.creator_id,updated_at=excluded.updated_at")
    .bind(identityId,profile.sub,email,verified,creatorId,new Date().toISOString(),new Date().toISOString()).run();

  const rawSession=randomToken(32),hash=await sha256Hex(rawSession),sessionId=crypto.randomUUID();
  const maxAge=30*24*60*60,expiresAt=new Date(Date.now()+maxAge*1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id,auth_identity_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)")
    .bind(sessionId,identityId,hash,expiresAt,new Date().toISOString(),new Date().toISOString()).run();
  const setCookie=sessionCookie(rawSession,maxAge);

  if(Number(login.popup||0)===1){
    const returnTo=safeReturn(login.return_to);
    const body='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Signed in</title></head><body style="font-family:system-ui;padding:32px;text-align:center"><p>Signed in. You can close this window.</p><script>if(window.opener){window.opener.postMessage({type:"secretnests-auth",ok:true,returnTo:'+JSON.stringify(returnTo)+'},'+JSON.stringify(origin)+');window.close()}else{location.href='+JSON.stringify(returnTo)+'}</script></body></html>';
    return new Response(body,{headers:{"content-type":"text/html; charset=utf-8","set-cookie":setCookie,"cache-control":"no-store"}});
  }
  return new Response(null,{status:302,headers:{location:origin+safeReturn(login.return_to),"set-cookie":setCookie,"cache-control":"no-store"}});
}

export async function authMe(request,env){
  const user=await currentCreator(request,env);
  return new Response(JSON.stringify(user?{ok:true,user:{id:user.creator_id,handle:user.handle,display_name:user.display_name,avatar_url:user.avatar_url,email:user.email}}:{ok:false,user:null}),{
    status:user?200:401,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}

export async function logout(request,env,origin){
  const raw=parseCookies(request).sn_session;
  if(raw){
    const hash=await sha256Hex(raw);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash).run().catch(()=>{});
  }
  const domain=authDomain(env),clear=sessionCookie("",0);
  if(authConfigured(env)){
    const u=new URL("https://"+domain+"/v2/logout");
    u.searchParams.set("client_id",env.AUTH0_CLIENT_ID);
    u.searchParams.set("returnTo",origin+"/");
    return new Response(null,{status:302,headers:{location:u.toString(),"set-cookie":clear,"cache-control":"no-store"}});
  }
  return new Response(null,{status:302,headers:{location:origin+"/","set-cookie":clear,"cache-control":"no-store"}});
}
