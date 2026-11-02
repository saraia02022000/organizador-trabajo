// Instalador del widget Organizador (vuelve a ejecutarlo para actualizar)
const url = 'https://saraia02022000.github.io/organizador-trabajo/organizador-widget.js'
const code = await new Request(url).loadString()
if (code.indexOf('Organizador de trabajo') < 0) throw new Error('No se pudo descargar el widget')
const enICloud = module.filename.indexOf('Mobile Documents') >= 0
const fm = enICloud ? FileManager.iCloud() : FileManager.local()
fm.writeString(fm.joinPath(fm.documentsDirectory(), 'Organizador.js'), code)
const a = new Alert()
a.title = 'Listo'
a.message = 'Abre el script Organizador para poner el enlace'
a.addAction('OK')
await a.present()
