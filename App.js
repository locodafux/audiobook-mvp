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
  Play, Search, Headphones, Undo2, Redo2, PauseCircle, CheckCircle2, 
  DownloadCloud, Library, Square, CheckSquare, Trash2, Clock, X, SkipForward, SkipBack
} from 'lucide-react-native';

const IP = "unconvertibly-nonexpansive-marguerita.ngrok-free.dev";
const API_BASE = `https://${IP}/api/mobile`;

export default function App() {
  const [chapters, setChapters] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [offlineIds, setOfflineIds] = useState(new Set());
  const [playingId, setPlayingId] = useState(null);
  const [metadata, setMetadata] = useState([]); 
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  
  const [isDownloadModalVisible, setIsDownloadModalVisible] = useState(false);
  const [selectedForDownload, setSelectedForDownload] = useState(new Set());

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  const activeChapter = useMemo(() => chapters.find(c => c.id === playingId), [playingId, chapters]);
  const missingChapters = useMemo(() => chapters.filter(c => c.is_ready && !offlineIds.has(c.id)), [chapters, offlineIds]);
  const visibleChapters = useMemo(() => {
    return chapters.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const isOffline = offlineIds.has(c.id);
      return showOfflineOnly ? (matchesSearch && isOffline) : matchesSearch;
    });
  }, [chapters, searchQuery, offlineIds, showOfflineOnly]);

  const downloadSelected = async () => {
    const toDownload = missingChapters.filter(c => selectedForDownload.has(c.id));
    setIsDownloadingAll(true);
    setIsDownloadModalVisible(false);
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
    setIsDownloadingAll(false);
    setSelectedForDownload(new Set());
  };

  const handleAction = useCallback(async (item) => {
    const audioUri = `${FileSystem.documentDirectory}${item.id}.mp3`;
    const metaUri = `${FileSystem.documentDirectory}${item.id}.json`;
    setPlayingId(item.id);
    try {
      const localMeta = await FileSystem.getInfoAsync(metaUri);
      if (localMeta.exists) {
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
    
    // Updated speed setting logic
    if (player) {
      player.playbackSpeed = playbackSpeed;
    }
  }, [player, playbackSpeed]);

  const handleNextChapter = () => {
    const currentIndex = visibleChapters.findIndex(c => c.id === playingId);
    if (currentIndex !== -1 && currentIndex < visibleChapters.length - 1) {
      handleAction(visibleChapters[currentIndex + 1]);
    }
  };

  const handlePreviousChapter = () => {
    const currentIndex = visibleChapters.findIndex(c => c.id === playingId);
    if (currentIndex > 0) {
      handleAction(visibleChapters[currentIndex - 1]);
    } else {
      player.seekTo(0);
    }
  };

  const cycleSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (player) {
      player.playbackSpeed = next;
    }
  };

  useEffect(() => {
    (async () => {
      const info = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      setOfflineIds(new Set(info.filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', ''))));
      const res = await fetch(`${API_BASE}/chapters?limit=1000`).catch(() => null);
      if (res) {
        const data = await res.json();
        setChapters(data.items || []);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.brand}>MVS<Text style={{color: '#3b82f6'}}>AUDIO</Text></Text>
        <View style={styles.searchBox}>
          <Search color="#64748b" size={18} />
          <TextInput style={styles.input} placeholder="Search library..." placeholderTextColor="#64748b" value={searchQuery} onChangeText={setSearchQuery} />
        </View>
        <View style={styles.pillRow}>
          <TouchableOpacity style={[styles.pill, showOfflineOnly && styles.pillActive]} onPress={() => setShowOfflineOnly(!showOfflineOnly)}>
            <Library size={14} color={showOfflineOnly ? "white" : "#94a3b8"} />
            <Text style={[styles.pillText, showOfflineOnly && {color: 'white'}]}>Offline Only</Text>
          </TouchableOpacity>
          {missingChapters.length > 0 && (
            <TouchableOpacity style={styles.pill} onPress={() => setIsDownloadModalVisible(true)}>
              <DownloadCloud size={14} color="#94a3b8" />
              <Text style={styles.pillText}>Sync ({missingChapters.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList 
        data={visibleChapters}
        contentContainerStyle={{padding: 20, paddingBottom: 250}}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handleAction(item)}>
            <View style={{flex: 1}}>
              <Text style={[styles.rowTitle, playingId === item.id && {color: '#3b82f6'}]}>{item.name}</Text>
              <Text style={styles.rowMeta}>{offlineIds.has(item.id) ? "Downloaded" : "Available Online"}</Text>
            </View>
            {offlineIds.has(item.id) ? <CheckCircle2 size={18} color="#10b981" /> : <DownloadCloud size={18} color="#1e293b" />}
          </TouchableOpacity>
        )}
      />

      {activeChapter && (
        <View style={styles.player}>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${(status.currentTime/status.duration)*100 || 0}%` }]} />
          </View>
          <View style={styles.playerContent}>
            <View style={styles.playerHeader}>
               <TouchableOpacity onPress={cycleSpeed} style={styles.speedBadge}>
                 <Text style={styles.speedText}>{playbackSpeed}x</Text>
               </TouchableOpacity>
               <Text style={styles.activeTitle} numberOfLines={1}>{activeChapter.name}</Text>
               <View style={{width: 40}} /> 
            </View>
            <View style={styles.transcriptBox}>
              <Text style={styles.transcript}>
                {metadata.find(m => status.currentTime >= m.start && status.currentTime <= m.end)?.text || "..."}
              </Text>
            </View>
            <View style={styles.controls}>
              <TouchableOpacity onPress={handlePreviousChapter}><SkipBack color="white" size={32} /></TouchableOpacity>
              <TouchableOpacity onPress={() => player.seekTo(status.currentTime - 15)}><Undo2 color="white" size={32} /></TouchableOpacity>
              <TouchableOpacity onPress={() => status.playing ? player.pause() : player.play()}>
                {status.playing ? <PauseCircle color="#3b82f6" size={70} fill="white" /> : <Play color="#3b82f6" size={70} fill="white" />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => player.seekTo(status.currentTime + 15)}><Redo2 color="white" size={32} /></TouchableOpacity>
              <TouchableOpacity onPress={handleNextChapter}><SkipForward color="white" size={32} /></TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal visible={isDownloadModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTop}>
              <Text style={styles.modalHeading}>Sync to Device</Text>
              <TouchableOpacity onPress={() => setIsDownloadModalVisible(false)}><X color="white" /></TouchableOpacity>
            </View>
            <ScrollView style={{maxHeight: 350}}>
              {missingChapters.map(ch => (
                <TouchableOpacity key={ch.id} style={styles.selectRow} onPress={() => {
                  const n = new Set(selectedForDownload);
                  n.has(ch.id) ? n.delete(ch.id) : n.add(ch.id);
                  setSelectedForDownload(n);
                }}>
                  {selectedForDownload.has(ch.id) ? <CheckSquare color="#3b82f6" /> : <Square color="#475569" />}
                  <Text style={{color: 'white', marginLeft: 15, fontSize: 16}}>{ch.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.actionBtn} onPress={downloadSelected}>
              <Text style={styles.actionBtnText}>Download {selectedForDownload.size} (With Transcripts)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { padding: 20, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  brand: { color: 'white', fontSize: 24, fontWeight: '900', marginBottom: 15 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#020617', paddingHorizontal: 12, borderRadius: 12, height: 45 },
  input: { flex: 1, color: 'white', marginLeft: 10 },
  pillRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 8, paddingHorizontal: 12, borderRadius: 20, gap: 6 },
  pillActive: { backgroundColor: '#3b82f6' },
  pillText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  rowTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#475569', fontSize: 12, marginTop: 4 },
  player: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#0f172a', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  progressContainer: { height: 4, backgroundColor: '#1e293b' },
  progressBar: { height: '100%', backgroundColor: '#3b82f6' },
  playerContent: { padding: 25, alignItems: 'center', paddingBottom: 40 },
  playerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  speedBadge: { backgroundColor: '#1e293b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  speedText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 12 },
  activeTitle: { color: 'white', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  transcriptBox: { height: 60, justifyContent: 'center', marginTop: 10 },
  transcript: { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 15, paddingHorizontal: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#0f172a', padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  modalHeading: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  selectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  actionBtn: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 15, marginTop: 25, alignItems: 'center' },
  actionBtnText: { color: 'white', fontWeight: 'bold' }
});