import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, Alert, TextInput, StatusBar, Keyboard,
  Modal, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus, AudioSession } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy'; 
import { 
  Play, Search, Headphones, Undo2, Redo2, PauseCircle, CheckCircle2, DownloadCloud, Check
} from 'lucide-react-native';

const IP = "unconvertibly-nonexpansive-marguerita.ngrok-free.dev";
const API_BASE = `https://${IP}/api/mobile`;
const ITEM_HEIGHT = 54; 

export default function App() {
  const [chapters, setChapters] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [offlineIds, setOfflineIds] = useState(new Set());
  const [playingId, setPlayingId] = useState(null);
  const [metadata, setMetadata] = useState([]); 
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedForDownload, setSelectedForDownload] = useState(new Set());

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const lastSaveTime = useRef(0);
  const flatListRef = useRef(null);
  const scrollOffset = useRef(0);

  // --- 1. MEMOIZED DATA ---
  // We define this at the top so it's available to all functions below
  const activeChapter = useMemo(() => 
    chapters.find(c => c.id === playingId), 
  [playingId, chapters]);

  const missingChapters = useMemo(() => 
    chapters.filter(c => c.is_ready && !offlineIds.has(c.id)), 
  [chapters, offlineIds]);

  // --- 2. AUDIO LOGIC ---
  const handleAction = useCallback(async (item, startTime = 0) => {
    Keyboard.dismiss();
    const fileUri = `${FileSystem.documentDirectory}${item.id}.mp3`;
    setPlayingId(item.id);

    try {
      const metaRes = await fetch(`${API_BASE}/metadata/${item.id}`);
      const data = await metaRes.json();
      setMetadata(data);
    } catch (e) { setMetadata([]); }
    
    const playAudio = () => {
      player.replace({ uri: fileUri });
      if (startTime > 0) player.seekTo(startTime); 
      player.play();
    };

    if (offlineIds.has(item.id)) {
      playAudio();
    } else if (item.is_ready) {
      setLoading(true);
      try {
        const res = await FileSystem.downloadAsync(`${API_BASE}/download/${item.id}`, fileUri);
        if (res.status === 200) {
          setOfflineIds(prev => new Set([...prev, item.id]));
          playAudio();
        }
      } catch (err) {
        Alert.alert("Sync Error", "Could not download chapter.");
      }
      setLoading(false);
    }
  }, [offlineIds, player]);

  // --- 3. INITIALIZATION ---
  useEffect(() => {
    const initApp = async () => {
      try {
        if (AudioSession && typeof AudioSession.setCategoryAsync === 'function') {
          await AudioSession.setCategoryAsync('Playback', {
            staysActiveInBackground: true,
            interruptionModeAndroid: 1, 
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false
          });
          await AudioSession.setActiveAsync(true);
        }
        await fetchChapters();
      } catch (e) {
        console.error("Initialization Error:", e);
      }
    };
    initApp();
  }, []);

  const fetchChapters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chapters?limit=1000`);
      const data = await res.json();
      if (data?.items) {
        setChapters(data.items);
        const info = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
        setOfflineIds(new Set(info.filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', ''))));
        
        const saved = await AsyncStorage.getItem('MVS_PROGRESS');
        if (saved) {
          const { id, time } = JSON.parse(saved);
          const ch = data.items.find(c => c.id === id);
          if (ch) handleAction(ch, time);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [handleAction]);

  // --- 4. SLIDE SELECT LOGIC ---
  const handleMove = (e) => {
    const { locationY } = e.nativeEvent;
    const index = Math.floor((locationY + scrollOffset.current) / ITEM_HEIGHT);
    if (index >= 0 && index < missingChapters.length) {
      const id = missingChapters[index].id;
      if (!selectedForDownload.has(id)) {
        setSelectedForDownload(prev => new Set([...prev, id]));
      }
    }
  };

  const downloadSelected = async () => {
    const toDownload = missingChapters.filter(c => selectedForDownload.has(c.id));
    if (toDownload.length === 0) return;
    setIsDownloadingAll(true);
    setIsModalVisible(false);
    for (const chapter of toDownload) {
      const fileUri = `${FileSystem.documentDirectory}${chapter.id}.mp3`;
      try {
        const res = await FileSystem.downloadAsync(`${API_BASE}/download/${chapter.id}`, fileUri);
        if (res.status === 200) setOfflineIds(prev => new Set([...prev, chapter.id]));
      } catch (err) { console.error(err); }
    }
    setIsDownloadingAll(false);
    setSelectedForDownload(new Set());
  };

  // Auto-Next & Progress Save
  useEffect(() => {
    if (status.didJustFinish) {
      const currentIndex = chapters.findIndex(c => c.id === playingId);
      if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
        const nextChapter = chapters[currentIndex + 1];
        if (nextChapter.is_ready || offlineIds.has(nextChapter.id)) handleAction(nextChapter);
      }
    }
    const now = Date.now();
    if (playingId && status.currentTime > 0 && (now - lastSaveTime.current > 5000)) {
      lastSaveTime.current = now;
      AsyncStorage.setItem('MVS_PROGRESS', JSON.stringify({ id: playingId, time: status.currentTime }));
    }
  }, [status.didJustFinish, status.currentTime, playingId, chapters, offlineIds, handleAction]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.logo}><Headphones color="white" size={18} /></View>
          <Text style={styles.headerTitle}>MVS AUDIOBOOK</Text>
        </View>
        <View style={styles.searchContainer}>
          <Search color="#64748b" size={16} />
          <TextInput style={styles.searchInput} placeholder="Search..." placeholderTextColor="#64748b" value={searchQuery} onChangeText={setSearchQuery}/>
        </View>
      </View>

      {missingChapters.length > 0 && (
        <TouchableOpacity style={styles.downloadBar} onPress={() => setIsModalVisible(true)} disabled={isDownloadingAll}>
          {isDownloadingAll ? <ActivityIndicator size="small" color="white" /> : <DownloadCloud color="white" size={18} />}
          <Text style={styles.downloadBarText}>
            {isDownloadingAll ? `Downloading Queue...` : `Sync Chapters (${missingChapters.length})`}
          </Text>
        </TouchableOpacity>
      )}

      {/* MULTI-SELECT MODAL */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select to Sync</Text>
                <Text style={styles.modalSubtitle}>Slide checkboxes to multi-select</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedForDownload(new Set())}><Text style={styles.clearText}>Clear</Text></TouchableOpacity>
            </View>
            <View style={styles.listContainer}>
              <ScrollView 
                onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
              >
                {missingChapters.map((ch) => (
                  <View key={ch.id} style={[styles.selectionRow, selectedForDownload.has(ch.id) && styles.rowSelected]}>
                    <View 
                      style={styles.dragHandle}
                      onStartShouldSetResponder={() => true}
                      onResponderMove={handleMove}
                    >
                      <View style={[styles.checkbox, selectedForDownload.has(ch.id) && styles.checkboxActive]}>
                        {selectedForDownload.has(ch.id) && <Check size={12} color="white" strokeWidth={3} />}
                      </View>
                    </View>
                    <Text style={styles.selectionText} numberOfLines={1}>{ch.name}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={downloadSelected}><Text style={styles.confirmText}>Download {selectedForDownload.size}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PLAYER */}
      <View style={styles.workspace}>
        <View style={styles.playerCard}>
          <Text style={styles.chTitle} numberOfLines={1}>{activeChapter?.name || "Ready to Listen"}</Text>
          <View style={styles.displayArea}>
            <Text style={styles.displayText}>
              {metadata.find(m => status.currentTime >= m.start && status.currentTime <= m.end)?.text || "..."}
            </Text>
          </View>
          <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${(status.currentTime/status.duration)*100 || 0}%` }]} /></View>
          <View style={styles.controls}>
            <TouchableOpacity onPress={() => player.seekTo(status.currentTime - 10)}><Undo2 color="#94a3b8" size={30} /></TouchableOpacity>
            <TouchableOpacity onPress={() => status.playing ? player.pause() : player.play()}>
              {status.playing ? <PauseCircle color="#3b82f6" size={72} fill="white" /> : <Play color="#3b82f6" size={72} fill="white" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => player.seekTo(status.currentTime + 10)}><Redo2 color="#94a3b8" size={30} /></TouchableOpacity>
          </View>
        </View>
      </View>
      
      {/* MINI LIST */}
      <View style={styles.miniListWrapper}>
        <FlatList 
          ref={flatListRef}
          data={chapters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))}
          keyExtractor={item => item.id} 
          horizontal 
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[styles.miniCard, playingId === item.id && styles.miniActive]} 
              onPress={() => handleAction(item)}
            >
              <Text style={[styles.miniText, playingId === item.id && {color: 'white'}]} numberOfLines={2}>{item.name}</Text>
              {offlineIds.has(item.id) && <CheckCircle2 size={12} color="#4ade80" style={{marginTop: 6}} />}
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { padding: 16, backgroundColor: '#0f172a' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  logo: { backgroundColor: '#3b82f6', padding: 6, borderRadius: 8 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '900', marginLeft: 10 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 12, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, color: 'white', marginLeft: 10 },
  downloadBar: { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12 },
  downloadBarText: { color: 'white', fontWeight: 'bold', fontSize: 13, marginLeft: 10 },
  workspace: { flex: 1, justifyContent: 'center', padding: 20 },
  playerCard: { backgroundColor: '#0f172a', borderRadius: 32, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
  chTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold' },
  displayArea: { height: 160, justifyContent: 'center' },
  displayText: { color: '#f1f5f9', fontSize: 22, textAlign: 'center', fontWeight: '500' },
  progressBar: { height: 4, width: '100%', backgroundColor: '#1e293b', borderRadius: 2, marginBottom: 20 },
  progressFill: { height: '100%', backgroundColor: '#3b82f6', borderRadius: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  miniListWrapper: { position: 'absolute', bottom: 30, width: '100%', height: 90 },
  miniCard: { backgroundColor: '#0f172a', width: 140, height: 80, marginHorizontal: 8, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'center' },
  miniActive: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  miniText: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0f172a', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalSubtitle: { color: '#64748b', fontSize: 12 },
  clearText: { color: '#3b82f6', fontWeight: 'bold' },
  listContainer: { height: 350, backgroundColor: '#020617', borderRadius: 16, overflow: 'hidden' },
  selectionRow: { flexDirection: 'row', alignItems: 'center', height: ITEM_HEIGHT, borderBottomWidth: 0.5, borderBottomColor: '#1e293b' },
  rowSelected: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
  dragHandle: { paddingLeft: 16, paddingRight: 20, height: '100%', justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#3b82f6' },
  selectionText: { color: '#f1f5f9', fontSize: 14, flex: 1 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: '#1e293b', alignItems: 'center' },
  confirmBtn: { flex: 2, padding: 16, borderRadius: 14, backgroundColor: '#3b82f6', alignItems: 'center' },
  cancelText: { color: '#94a3b8', fontWeight: 'bold' },
  confirmText: { color: 'white', fontWeight: 'bold' }
});