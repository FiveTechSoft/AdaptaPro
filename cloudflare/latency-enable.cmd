@echo off
setlocal
rem Owner-approved single demo job; never invokes /run or sends email.
rem Default: existing local deployment config, NOT the repository defaults.
set "CFG=C:\tmp\cloudflare\wrangler.jsonc"
if not "%~1"=="" set "CFG=%~f1"
if not exist "%CFG%" (echo Config missing: "%CFG%" & exit /b 1)
for %%I in ("%CFG%") do cd /d "%%~dpI"
node -e "const fs=require('fs'),p=process.argv[1],s=fs.readFileSync(p,'utf8'),c=JSON.parse(s),v=c.vars||{},q=String.fromCharCode(34);for(const k of ['TEST_JOB_ID','SEND_ENABLED','RESPONSE_MODE']){if((s.match(new RegExp(q+k+q+'\\s*:','g'))||[]).length!==1)throw Error('Duplicate or missing key: '+k)}if(c.name!=='adaptapro-bridge'||c.main!=='worker.mjs'||v.ERP_MAILBOX!=='fivetech2@gmail.com'||v.INSTINCT_MAILBOX!=='3xdy4j@mail.instinct.com'||!Array.isArray(c.triggers?.crons)||c.triggers.crons.length||Object.keys(c.env||{}).length)throw Error('Unexpected config; stopped');if(v.RESPONSE_MODE!=='unverified-test')throw Error('Response mode must be unverified-test');v.TEST_JOB_ID='cbd211d6d5ae4b7e8adf4a96caddb671';v.SEND_ENABLED='true';fs.copyFileSync(p,p+'.before-latency.bak');fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');console.log('Configuration saved. No email sent by this script.');" "%CFG%"
if errorlevel 1 exit /b 1
findstr /N /I "SEND_ENABLED TEST_JOB_ID RESPONSE_MODE crons" "%CFG%"
if errorlevel 1 exit /b 1
call npx wrangler deploy --config "%CFG%"
if errorlevel 1 (echo Deploy failed. Live state NOT confirmed. & exit /b 1)
echo Deployment completed. Verify bindings and version above.
echo Sending is enabled ONLY for job cbd211d6d5ae4b7e8adf4a96caddb671. No turn executed.
echo Run the shutdown script after the single test or when stopping.
