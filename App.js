import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  ActivityIndicator, Alert, TextInput, StatusBar, Keyboard 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy'; 
import { 
  Play, Search, Headphones, Undo2, Redo2, PauseCircle, CheckCircle2, XCircle, DownloadCloud 
} from 'lucide-react-native';

const IP = "192.168.8.104";
const API_BASE = `http://${IP}/api/mobile`;

export default function App() {
  const [chapters, setChapters] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false); // New state
  const [offlineIds, setOfflineIds] = useState(new Set());
  const [playingId, setPlayingId] = useState(null);
  const [metadata, setMetadata] = useState([]); 

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const lastSaveTime = useRef(0);
  const flatListRef = useRef(null);

  // --- DOWNLOAD MANAGER LOGIC ---
  const missingChapters = useMemo(() => {
    return chapters.filter(c => c.is_ready && !offlineIds.has(c.id));
  }, [chapters, offlineIds]);

  const downloadAllMissing = async () => {
    if (missingChapters.length === 0) return;
    setIsDownloadingAll(true);
    
    for (const chapter of missingChapters) {
      const fileUri = `${FileSystem.documentDirectory}${chapter.id}.mp3`;
      try {
        const res = await FileSystem.downloadAsync(`${API_BASE}/download/${chapter.id}`, fileUri);
        if (res.status === 200) {
          setOfflineIds(prev => new Set([...prev, chapter.id]));
        }
      } catch (err) {
        console.error(`Failed to download ${chapter.name}`);
      }
    }
    setIsDownloadingAll(false);
    Alert.alert("Success", "All available chapters are now offline.");
  };

  // --- EXISTING LOGIC ---
  const scrollToListIndex = useCallback((chapterId, listData) => {
    const index = listData.findIndex(c => c.id === chapterId);
    if (index !== -1 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }, 600); 
    }
  }, []);

  const handleAction = useCallback(async (item, startTime = 0) => {
    Keyboard.dismiss();
    const fileUri = `${FileSystem.documentDirectory}${item.id}.mp3`;
    setPlayingId(item.id);
    
    try {
      const metaRes = await fetch(`${API_BASE}/metadata/${item.id}`);
      setMetadata(await metaRes.json());
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
      const res = await FileSystem.downloadAsync(`${API_BASE}/download/${item.id}`, fileUri);
      if (res.status === 200) {
        setOfflineIds(prev => new Set([...prev, item.id]));
        playAudio();
      }
      setLoading(false);
    }
  }, [offlineIds, player]);

  useEffect(() => {
    const now = Date.now();
    if (playingId && status.currentTime > 0 && (now - lastSaveTime.current > 3000)) {
      lastSaveTime.current = now;
      AsyncStorage.setItem('MVS_PROGRESS', JSON.stringify({ id: playingId, time: status.currentTime })).catch(() => {});
    }
  }, [status.currentTime, playingId]);

  const fetchChapters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chapters?limit=1000`);
      const data = await res.json();
      if (data?.items) {
        setChapters(data.items);
        const saved = await AsyncStorage.getItem('MVS_PROGRESS');
        if (saved) {
          const { id, time } = JSON.parse(saved);
          const ch = data.items.find(c => c.id === id);
          if (ch) { handleAction(ch, time); scrollToListIndex(id, data.items); }
        }
      }
      const info = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      setOfflineIds(new Set(info.filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', ''))));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [handleAction, scrollToListIndex]);

  useEffect(() => { fetchChapters(); }, []);

  const filteredChapters = useMemo(() => {
    return chapters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, chapters]);

  const activeChapter = useMemo(() => chapters.find(c => c.id === playingId), [playingId, chapters]);

  const currentParagraph = useMemo(() => {
    const found = metadata.find(m => status.currentTime >= m.start && status.currentTime <= m.end);
    return found ? found.text : (activeChapter ? "Listening..." : "Select Chapter");
  }, [status.currentTime, metadata, activeChapter]);

  const formatTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

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
          {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><XCircle color="#64748b" size={18} /></TouchableOpacity>}
        </View>
      </View>

      {/* NEW DOWNLOAD ALL BAR */}
      {missingChapters.length > 0 && (
        <TouchableOpacity 
          style={styles.downloadBar} 
          onPress={downloadAllMissing} 
          disabled={isDownloadingAll}
        >
          {isDownloadingAll ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <DownloadCloud color="white" size={18} />
          )}
          <Text style={styles.downloadBarText}>
            {isDownloadingAll ? `Downloading Queue...` : `Download ${missingChapters.length} available chapters`}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.workspace}>
        <View style={styles.playerCard}>
          <Text style={styles.chLabel}>Now Playing</Text>
          <Text style={styles.chTitle} numberOfLines={1}>{activeChapter?.name || "Pick a Chapter"}</Text>
          <View style={styles.displayArea}><Text style={styles.displayText}>{currentParagraph}</Text></View>
          <View style={styles.progressArea}>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${(status.currentTime/status.duration)*100 || 0}%` }]} /></View>
            <View style={styles.timeRow}><Text style={styles.timeText}>{formatTime(status.currentTime)}</Text><Text style={styles.timeText}>{formatTime(status.duration)}</Text></View>
          </View>
          
          <View style={styles.controls}>
            <TouchableOpacity onPress={() => player.seekTo(status.currentTime - 10)}><Undo2 color="#94a3b8" size={30} /></TouchableOpacity>
            <TouchableOpacity onPress={() => status.playing ? player.pause() : player.play()}>
              {status.playing ? <PauseCircle color="#3b82f6" size={72} fill="white" /> : <Play color="#3b82f6" size={72} fill="white" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => player.seekTo(status.currentTime + 10)}><Redo2 color="#94a3b8" size={30} /></TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.bottomListWrapper}>
        <FlatList 
          ref={flatListRef}
          data={filteredChapters} 
          keyExtractor={item => item.id} 
          horizontal 
          showsHorizontalScrollIndicator={false}
          getItemLayout={(data, index) => ({ length: 156, offset: 156 * index, index })}
          renderItem={({ item }) => (
            <TouchableOpacity 
                style={[styles.miniCard, playingId === item.id && styles.activeMini, !item.is_ready && styles.notReadyCard]} 
                onPress={() => item.is_ready || offlineIds.has(item.id) ? handleAction(item) : Alert.alert("Not Ready", "This chapter hasn't been processed by the Mac yet.")}
            >
              <Text style={[styles.miniText, playingId === item.id && {color: 'white'}]} numberOfLines={2}>{item.name}</Text>
              {offlineIds.has(item.id) ? (
                <View style={styles.checkIcon}><CheckCircle2 size={12} color="#4ade80" /></View>
              ) : item.is_ready ? (
                <View style={styles.checkIcon}><DownloadCloud size={12} color="#3b82f6" /></View>
              ) : null}
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { padding: 16, backgroundColor: '#0f172a', borderBottomWidth: 1, borderColor: '#1e293b' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  logo: { backgroundColor: '#3b82f6', padding: 6, borderRadius: 8 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '900', marginLeft: 10, flex: 1 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 12, borderRadius: 10, height: 40 },
  searchInput: { flex: 1, color: 'white', marginLeft: 10 },
  downloadBar: { backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, gap: 10 },
  downloadBarText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  workspace: { flex: 1, justifyContent: 'center', padding: 20 },
  playerCard: { backgroundColor: '#0f172a', borderRadius: 32, padding: 30, borderWidth: 1, borderColor: '#1e293b', alignItems: 'center' },
  chLabel: { color: '#3b82f6', fontSize: 10, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' },
  chTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold', marginBottom: 25 },
  displayArea: { height: 160, justifyContent: 'center' },
  displayText: { color: '#f1f5f9', fontSize: 24, textAlign: 'center', fontWeight: '500', lineHeight: 34 },
  progressArea: { width: '100%', marginVertical: 30 },
  progressBar: { height: 6, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#3b82f6' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeText: { color: '#64748b', fontSize: 12, fontFamily: 'monospace' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 35 },
  bottomListWrapper: { position: 'absolute', bottom: 30, width: '100%', height: 90 },
  miniCard: { backgroundColor: '#0f172a', width: 140, height: 80, marginHorizontal: 8, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'center' },
  notReadyCard: { opacity: 0.4 },
  activeMini: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  miniText: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  checkIcon: { marginTop: 6 }
});