import { useReducer } from 'react';
import { Board } from './components/Board';
import { EndScreen } from './components/EndScreen';
import { TitleScreen } from './components/TitleScreen';
import { createInitialState, reduce } from './game/engine';

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, createInitialState);

  return (
    <div className="app">
      <div className="grain" />
      {state.phase === 'title' && <TitleScreen onStart={() => dispatch({ type: 'START_GAME' })} />}
      {state.phase === 'ended' && <EndScreen state={state} onRestart={() => dispatch({ type: 'RESTART' })} />}
      {state.phase !== 'title' && state.phase !== 'ended' && <Board state={state} dispatch={dispatch} />}
    </div>
  );
}
