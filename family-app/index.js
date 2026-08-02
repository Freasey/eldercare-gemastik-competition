import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

import App from './App';

// WebRTC menyuntikkan RTCPeerConnection, MediaStream, dan kawan-kawannya ke
// global scope. Harus terjadi SEBELUM komponen mana pun ter-import — kalau
// dipanggil di dalam App.js, layar panggilan sudah terlanjur di-evaluasi dan
// LiveKit menemukan global yang belum ada.
registerGlobals();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
