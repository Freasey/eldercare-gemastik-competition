import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

import App from './App';

// WebRTC menyuntikkan RTCPeerConnection dan kawan-kawannya ke global scope,
// dipakai panggilan darurat (`voice/emergencyCall.js`). Harus terjadi SEBELUM
// modul mana pun yang menyentuh livekit-client ter-import.
registerGlobals();

registerRootComponent(App);
