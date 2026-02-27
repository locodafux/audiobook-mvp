import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react-native';

export default function PlayerControls({ status, isPlaying, onPlayPause, onForward, onBackward, isLoading }) {
  const progress = (status.currentTime / (status.duration || 1)) * 100;

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Buttons */}
      <View style={styles.buttonsRow}>
        <TouchableOpacity onPress={onBackward} style={styles.btn}>
          <SkipBack size={28} color="white" />
        </TouchableOpacity>

        <TouchableOpacity onPress={onPlayPause} style={styles.playBtn}>
          {isLoading ? <ActivityIndicator color="white" /> : isPlaying ? <Pause size={36} color="white" /> : <Play size={36} color="white" />}
        </TouchableOpacity>

        <TouchableOpacity onPress={onForward} style={styles.btn}>
          <SkipForward size={28} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#0f172a', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  progressBg: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, marginBottom: 12 },
  progressFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 2 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  btn: { padding: 10 },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
});