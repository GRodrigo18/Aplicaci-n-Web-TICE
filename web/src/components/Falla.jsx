import React from 'react';

// Si una pantalla falla, muestra un aviso con la opción de volver en vez de dejar la página en blanco
export default class Falla extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error en la pantalla:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h2 className="text-lg font-bold text-slate-900">Algo salió mal en esta pantalla</h2>
        <p className="mt-2 text-sm text-slate-600">No se perdió ningún dato. Vuelva a cargar la página; si se repite, avise al Jefe de TI con esta referencia:</p>
        <p className="mt-2 break-words font-mono text-xs text-red-600">{String(this.state.error?.message || this.state.error)}</p>
        <button className="btn-primario mt-5" onClick={() => window.location.reload()}>Volver a cargar</button>
      </div>
    );
  }
}
