/**
 * Runtime compartido de Cornerstone para los visores DICOM.
 * Se inicializa una sola vez y se reutiliza entre tomografía, resonancia y visor genérico.
 */
export type DicomModules = {
  core: any;
  loader: any;
  tools: any;
};

let dicomModulesPromise: Promise<DicomModules> | undefined;

/** Carga Cornerstone solo cuando se abre un estudio DICOM. */
export function getDicomModules(): Promise<DicomModules> {
  if (!dicomModulesPromise) {
    dicomModulesPromise = Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/dicom-image-loader'),
      import('@cornerstonejs/tools'),
    ]).then(async ([core, loader, tools]) => {
      // core.init() y tools.init() son asíncronos: hay que esperarlos antes de crear
      // el RenderingEngine o registrar herramientas; si no, el visor puede abrirse
      // sin motor de render listo y las imágenes no se pintan.
      await core.init();
      await loader.init({
        // El builder de Angular no resuelve estas rutas WASM automáticamente.
        wasmBasePath: new URL('assets/cs-wasm/', document.baseURI).toString(),
      });
      await tools.init();

      [tools.PanTool, tools.ZoomTool, tools.WindowLevelTool, tools.StackScrollTool].forEach(
        (tool) => tools.addTool(tool),
      );

      return { core, loader, tools };
    }).catch((error) => {
      // Si la inicialización falla, no dejar la promesa rechazada en caché:
      // así el siguiente intento de abrir el visor vuelve a inicializar.
      dicomModulesPromise = undefined;
      throw error;
    });
  }
  return dicomModulesPromise;
}

/** Crea el grupo de herramientas estándar (ventana/nivel, pan, zoom y scroll de cortes). */
export function crearGrupoHerramientas(
  modules: DicomModules,
  viewportId: string,
  engineId: string,
  toolGroupId: string,
): void {
  const grupo = modules.tools.ToolGroupManager.createToolGroup(toolGroupId);
  if (!grupo) throw new Error('No se pudo preparar las herramientas del visor.');

  [modules.tools.PanTool, modules.tools.ZoomTool, modules.tools.WindowLevelTool, modules.tools.StackScrollTool].forEach(
    (tool) => grupo.addTool(tool.toolName),
  );
  grupo.addViewport(viewportId, engineId);

  const botones = modules.tools.Enums.MouseBindings;
  grupo.setToolActive(modules.tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: botones.Primary }] });
  grupo.setToolActive(modules.tools.PanTool.toolName, { bindings: [{ mouseButton: botones.Auxiliary }] });
  grupo.setToolActive(modules.tools.ZoomTool.toolName, { bindings: [{ mouseButton: botones.Secondary }] });
  grupo.setToolActive(modules.tools.StackScrollTool.toolName, { bindings: [{ mouseButton: botones.Wheel }] });
}