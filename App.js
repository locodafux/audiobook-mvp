import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  StatusBar, ActivityIndicator, Modal, ScrollView, Alert 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { 
  CheckCircle2, DownloadCloud, Library, X, Square, 
  CheckSquare, Trash2 // Added Trash2 icon
} from 'lucide-react-native';

import TranscriptView from './components/TranscriptView';
import PlayerControls from './components/PlayerControls';

const API_BASE = `https://unconvertibly-nonexpansive-marguerita.ngrok-free.dev/api/mobile`;

export default function App() {
  const [chapters, setChapters] = useState([]);
  const [offlineIds, setOfflineIds] = useState(new Set());
  const [playingId, setPlayingId] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);
  const [isSyncModalVisible, setIsSyncModalVisible] = useState(false);
  const [selectedForDownload, setSelectedForDownload] = useState(new Set());

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  // --- NEW: CLEAR HISTORY LOGIC ---
  const clearHistory = async () => {
    Alert.alert(
      "Clear History?",
      "This will reset your last played chapter and resume position.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive", 
          onPress: async () => {
            await AsyncStorage.multiRemove(['last_played_id', 'last_played_time']);
            Alert.alert("History Cleared", "Your progress has been reset.");
          } 
        }
      ]
    );
  };

  // --- SAVE PROGRESS LOGIC ---
  useEffect(() => {
    if (playingId && status.currentTime > 0) {
      const save = async () => {
        await AsyncStorage.setItem('last_played_id', playingId);
        await AsyncStorage.setItem('last_played_time', status.currentTime.toString());
      };
      save();
    }
  }, [playingId, Math.floor(status.currentTime / 5)]);

  // --- RESUME LOGIC ---
  const resumeLastSession = async () => {
    const lastId = await AsyncStorage.getItem('last_played_id');
    const lastTime = await AsyncStorage.getItem('last_played_time');
    
    if (lastId && lastTime) {
      const chapter = chapters.find(c => c.id === lastId);
      if (chapter) {
        await handlePlay(chapter, parseFloat(lastTime));
      }
    } else {
      Alert.alert("No history", "You don't have a saved session to resume.");
    }
  };

  const handleOfflineToggle = async () => {
    const newState = !showOfflineOnly;
    setShowOfflineOnly(newState);
    if (newState) {
      resumeLastSession();
    }
  };

  const handlePlay = useCallback(async (item, startTime = 0) => {
    setPlayingId(item.id);
    const audioUri = `${FileSystem.documentDirectory}${item.id}.mp3`;
    const metaUri = `${FileSystem.documentDirectory}${item.id}.json`;

    try {
      const info = await FileSystem.getInfoAsync(metaUri);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(metaUri);
        setMetadata(JSON.parse(content));
      } else {
        const res = await fetch(`${API_BASE}/metadata/${item.id}`);
        const data = await res.json();
        setMetadata(data);
      }
    } catch (e) { setMetadata([]); }

    player.replace({ uri: audioUri });
    player.play();
    
    if (startTime > 0) {
      player.seekTo(startTime);
    }
  }, [player]);

  useEffect(() => {
    const init = async () => {
      try {
        const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
        setOfflineIds(new Set(files.filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', ''))));
        const res = await fetch(`${API_BASE}/chapters?limit=1000`);
        const data = await res.json();
        setChapters(data.items || []);
      } finally { setLoading(false); }
    };
    init();
  }, []);

  const visibleChapters = useMemo(() => {
    return chapters.filter(c => showOfflineOnly ? offlineIds.has(c.id) : true);
  }, [chapters, offlineIds, showOfflineOnly]);

  const missingChapters = useMemo(() => 
    chapters.filter(c => c.is_ready && !offlineIds.has(c.id)), 
    [chapters, offlineIds]
  );

  const startDownload = async () => {
    const toDownload = chapters.filter(c => selectedForDownload.has(c.id));
    setIsSyncModalVisible(false);
    for (const chapter of toDownload) {
      const audioUri = `${FileSystem.documentDirectory}${chapter.id}.mp3`;
      const metaUri = `${FileSystem.documentDirectory}${chapter.id}.json`;
      try {
        await Promise.all([
          FileSystem.downloadAsync(`${API_BASE}/download/${chapter.id}`, audioUri),
          FileSystem.downloadAsync(`${API_BASE}/metadata/${chapter.id}`, metaUri)
        ]);
        setOfflineIds(prev => new Set([...prev, chapter.id]));
      } catch (err) { console.error(err); }
    }
    setSelectedForDownload(new Set());
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>MVS<Text style={{color: '#3b82f6'}}>AUDIO</Text></Text>
          <TouchableOpacity onPress={clearHistory} style={styles.iconBtn}>
            <Trash2 size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.pillRow}>
          <TouchableOpacity 
            style={[styles.pill, showOfflineOnly && styles.pillActive]} 
            onPress={handleOfflineToggle}
          >
            <Library size={14} color={showOfflineOnly ? "white" : "#94a3b8"} />
            <Text style={[styles.pillText, showOfflineOnly && {color: 'white'}]}>
              Offline (Resume)
            </Text>
          </TouchableOpacity>
          {missingChapters.length > 0 && (
            <TouchableOpacity style={styles.pill} onPress={() => setIsSyncModalVisible(true)}>
              <DownloadCloud size={14} color="#94a3b8" />
              <Text style={styles.pillText}>Sync ({missingChapters.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList 
        data={visibleChapters}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 400 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handlePlay(item)}>
            <View>
              <Text style={[styles.rowTitle, playingId === item.id && {color: '#3b82f6'}]}>{item.name}</Text>
              <Text style={styles.rowSub}>{offlineIds.has(item.id) ? "Downloaded" : "Online"}</Text>
            </View>
            {offlineIds.has(item.id) ? <CheckCircle2 size={18} color="#10b981" /> : <DownloadCloud size={18} color="#475569" />}
          </TouchableOpacity>
        )}
      />

      <Modal visible={isSyncModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTop}>
              <Text style={styles.modalHeading}>Available to Download</Text>
              <TouchableOpacity onPress={() => setIsSyncModalVisible(false)}><X color="white" /></TouchableOpacity>
            </View>
            <ScrollView style={{maxHeight: 300}}>
              {missingChapters.map(ch => (
                <TouchableOpacity key={ch.id} style={styles.selectRow} onPress={() => {
                  const n = new Set(selectedForDownload);
                  n.has(ch.id) ? n.delete(ch.id) : n.add(ch.id);
                  setSelectedForDownload(n);
                }}>
                  {selectedForDownload.has(ch.id) ? <CheckSquare color="#3b82f6" /> : <Square color="#475569" />}
                  <Text style={{color: 'white', marginLeft: 15}}>{ch.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.actionBtn} onPress={startDownload}>
              <Text style={styles.actionBtnText}>Download {selectedForDownload.size} Items</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {playingId && (
        <View style={styles.playerWrapper}>
          <TranscriptView metadata={metadata} currentTime={status.currentTime} onSeek={(t) => player.seekTo(t)} />
          <PlayerControls status={status} player={player} speed={1.0} onCycleSpeed={() => {}} onNext={() => {}} onPrev={() => {}} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' },
  header: { padding: 20, backgroundColor: '#0f172a' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  brand: { color: 'white', fontSize: 22, fontWeight: '900' },
  iconBtn: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 10 },
  pillRow: { flexDirection: 'row', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 8, paddingHorizontal: 12, borderRadius: 20, gap: 6 },
  pillActive: { backgroundColor: '#3b82f6' },
  pillText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  rowTitle: { color: 'white', fontSize: 16, fontWeight: '600' },
  rowSub: { color: '#475569', fontSize: 12, marginTop: 4 },
  playerWrapper: { position: 'absolute', bottom: 0, width: '100%', height: 420, backgroundColor: '#0f172a' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#0f172a', padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalHeading: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  selectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  actionBtn: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 15, marginTop: 20, alignItems: 'center' },
  actionBtnText: { color: 'white', fontWeight: 'bold' }
});