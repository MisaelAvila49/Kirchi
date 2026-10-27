import { describe, expect, it } from 'vitest'
import { comandoDelCliente, textoConfiguracion, type EntornoEjecutable } from './configCliente'

const base: EntornoEjecutable = { plataforma: 'win32', windowsStore: false, empaquetado: true, execPath: 'C:\\Archivos\\Kirchi\\Kirchi.exe', appPath: 'C:\\Archivos\\Kirchi\\resources\\app.asar' }

describe('configuración del cliente', () => {
  it('instalador de Windows: el ejecutable de la instalación', () => {
    expect(comandoDelCliente(base)).toEqual({ command: 'C:\\Archivos\\Kirchi\\Kirchi.exe', args: ['--mcp'] })
  })
  it('Tienda: el alias kirchi.exe de WindowsApps', () => {
    const c = comandoDelCliente({ ...base, windowsStore: true, localAppData: 'C:\\Users\\a\\AppData\\Local' })
    expect(c.command.replace(/\//g, '\\')).toBe('C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps\\kirchi.exe')
    expect(c.args).toEqual(['--mcp'])
  })
  it('Linux con AppImage: la ruta del AppImage; macOS: el ejecutable del paquete', () => {
    expect(comandoDelCliente({ ...base, plataforma: 'linux', execPath: '/tmp/.mount/kirchi', appImage: '/home/a/Kirchi.AppImage' }).command).toBe('/home/a/Kirchi.AppImage')
    expect(comandoDelCliente({ ...base, plataforma: 'darwin', execPath: '/Applications/Kirchi.app/Contents/MacOS/Kirchi' }).command).toBe('/Applications/Kirchi.app/Contents/MacOS/Kirchi')
  })
  it('sin empaquetar lanza Electron con la carpeta de la aplicación', () => {
    expect(comandoDelCliente({ ...base, empaquetado: false, execPath: 'electron.exe', appPath: 'D:\\kirchi' })).toEqual({ command: 'electron.exe', args: ['D:\\kirchi', '--mcp'] })
  })
  it('el texto es el JSON de mcpServers', () => {
    expect(JSON.parse(textoConfiguracion(base))).toEqual({ mcpServers: { kirchi: { command: base.execPath, args: ['--mcp'] } } })
  })
})
