// App entry: Expo Router, plus the task Android runs to transcribe while Caster is closed.
import 'expo-router/entry';

import { PlayerCore } from './modules/player-core/src';

// Only in the installed app: Expo Go has no native player-core (or Whisper) to run it.
if (PlayerCore) {
  const { AppRegistry } = require('react-native');
  const { backgroundTranscribeTask } = require('./src/transcripts/background-task');
  AppRegistry.registerHeadlessTask('CasterTranscribe', () => backgroundTranscribeTask);
}
