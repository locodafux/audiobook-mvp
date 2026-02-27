import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, PauseCircle, Undo2, Redo2, SkipForward, SkipBack } from 'lucide-react-native';

export default function PlayerControls({ status, player, onNext, onPrev, speed, onCycleSpeed }) {
  const progress = (status.currentTime / status.duration) * 100 || 0;

  return (
    <View style={styles.container}>
      <View style={styles.progressBg}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <View style={styles.content}>
        <TouchableOpacity onPress={onCycleSpeed} style={styles.speedBtn}>
          <Text style={styles.speedText}>{speed}x</Text>
        </TouchableOpacity>
        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={onPrev}><SkipBack color="white" size={32} /></TouchableOpacity>
          <TouchableOpacity onPress={() => player.seekTo(status.currentTime - 15)}><Undo2 color="white" size={32} /></TouchableOpacity>
          <TouchableOpacity onPress={() => status.playing ? player.pause() : player.play()}>
            {status.playing ? <PauseCircle color="#3b82f6" size={75} fill="white" /> : <Play color="#3b82f6" size={75} fill="white" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => player.seekTo(status.currentTime + 15)}><Redo2 color="white" size={32} /></TouchableOpacity>
          <TouchableOpacity onPress={onNext}><SkipForward color="white" size={32} /></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#0f172a', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  progressBg: { height: 4, backgroundColor: '#1e293b' },
  progressFill: { height: '100%', backgroundColor: '#3b82f6' },
  content: { padding: 25, alignItems: 'center', paddingBottom: 40 },
  speedBtn: { backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 15 },
  speedText: { color: '#3b82f6', fontWeight: 'bold' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }
});