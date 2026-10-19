import sys
d=sys.argv[1]; out=sys.argv[2]
t=open(d+'/template.html').read()
app='\n'.join(open(d+'/'+f).read() for f in ['core.js','importer.js','views.js','io_views.js','report.js','actions.js'])
t=t.replace('/*CSS*/',open(d+'/style.css').read()).replace('/*APP*/',app.replace('</script','<\\/script')).replace('/*XLSX*/',open(d+'/vendor/xlsx-js-style.min.js').read().replace('</script','<\\/script')).replace('/*CPEXCEL*/',open(d+'/vendor/cpexcel.js').read().replace('</script','<\\/script'))
import time,secrets
t=t.replace('__BUILD_ID__',time.strftime('%Y%m%d%H%M%S')+secrets.token_hex(3))
open(out,'w').write(t)
print(len(t))
