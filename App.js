import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { 
  View, Text, FlatList, TouchableOpacity, StyleSheet, 
  StatusBar, ActivityIndicator, Modal, ScrollView, Alert, Dimensions,
  Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { 
  CheckCircle2, DownloadCloud, Library, X, Square, 
  CheckSquare, Trash2, Play, Pause, SkipBack, SkipForward,
  ChevronDown, ChevronUp, Wifi, WifiOff, RefreshCw,
  RotateCcw, ListX
} from 'lucide-react-native';

import TranscriptView from './components/TranscriptView';

const API_BASE = `https://unconvertibly-nonexpansive-marguerita.ngrok-free.dev/api/mobile`;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHAPTERS_CACHE_KEY = 'cached_chapters';
const AUTO_NEXT_KEY = 'auto_next_setting';

export default function App() {
  const [chapters, setChapters] = useState([]);
  const [offlineIds, setOfflineIds] = useState(new Set());
  const [playingId, setPlayingId] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOfflineOnly, setShowOfflineOnly] = useState(false);
  const [isSyncModalVisible, setIsSyncModalVisible] = useState(false);
  const [selectedForDownload, setSelectedForDownload] = useState(new Set());
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  
  // Audio player state
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  // Refs to preserve values during cleanup
  const playingIdRef = useRef(null);
  const soundRef = useRef(null);
  const progressInterval = useRef(null);

  // Update ref whenever playingId changes
  useEffect(() => {
    playingIdRef.current = playingId;
  }, [playingId]);

  // ============ LOGGING FUNCTIONS ============
  
  const logChapters = (chapterArray, title = "Chapters") => {
    chapterArray.forEach((ch, index) => {
      const isDownloaded = offlineIds.has(ch.id) ? '📱' : '☁️';
      const isPlaying_now = playingId === ch.id ? '▶️' : '  ';
    });
  };
  
  const logPlaybackStatus = (status) => {
    console.log('\n🎵 Playback Status:');
    console.log(`   Position: ${Math.floor(status.positionMillis/1000)}s / ${Math.floor(status.durationMillis/1000)}s`);
    console.log(`   Playing: ${status.isPlaying ? 'YES' : 'NO'}`);
    console.log(`   Loaded: ${status.isLoaded ? 'YES' : 'NO'}`);
    console.log(`   Current playingId: ${playingIdRef.current}`);
    if (status.didJustFinish) console.log('   ✅ FINISHED!');
  };

  // ============ SORTING ============

  // Sort chapters by name (only for full list)
  const sortChapters = (chaptersToSort) => {
    return [...chaptersToSort].sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  };

  // Load auto-next setting
  useEffect(() => {
    const loadAutoNext = async () => {
      try {
        const saved = await AsyncStorage.getItem(AUTO_NEXT_KEY);
        if (saved !== null) {
          setAutoNext(JSON.parse(saved));
          console.log('⚙️ Auto-next setting loaded:', JSON.parse(saved) ? 'ON' : 'OFF');
        }
      } catch (error) {
        console.error('Error loading auto-next setting:', error);
      }
    };
    loadAutoNext();
  }, []);

  // Save auto-next setting
  const toggleAutoNext = async () => {
    const newValue = !autoNext;
    setAutoNext(newValue);
    try {
      await AsyncStorage.setItem(AUTO_NEXT_KEY, JSON.stringify(newValue));
      console.log('⚙️ Auto-next setting saved:', newValue ? 'ON' : 'OFF');
    } catch (error) {
      console.error('Error saving auto-next setting:', error);
    }
  };

  // Clear all selected downloads
  const clearSelectedDownloads = () => {
    setSelectedForDownload(new Set());
    console.log('🧹 Cleared download selections');
  };

  // Check server availability
  const checkServerAvailability = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/chapters?limit=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      
      const isAvailable = response.ok;
      console.log('📡 Server status:', isAvailable ? 'ONLINE' : 'OFFLINE');
      setIsOnline(isAvailable);
      return isAvailable;
    } catch (error) {
      console.log('📡 Server status: OFFLINE (fetch failed)');
      setIsOnline(false);
      return false;
    }
  }, []);

  // Check server on mount and periodically
  useEffect(() => {
    checkServerAvailability();
    
    // Check every 60 seconds
    const interval = setInterval(checkServerAvailability, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const loadCachedChapters = async () => {
    try {
      const cached = await AsyncStorage.getItem(CHAPTERS_CACHE_KEY);
      if (cached) {
        const cachedData = JSON.parse(cached);
        // Don't sort cached data - preserve original order
        setChapters(cachedData);
        return true;
      } else {
        console.log('📭 No cached chapters found');
      }
    } catch (error) {
      console.error('Error loading cached chapters:', error);
    }
    return false;
  };

  const cacheChapters = async (chaptersData) => {
    try {
      // Don't sort when caching - preserve original order
      await AsyncStorage.setItem(CHAPTERS_CACHE_KEY, JSON.stringify(chaptersData));
      console.log(`💾 Cached ${chaptersData.length} chapters`);
    } catch (error) {
      console.error('Error caching chapters:', error);
    }
  };

  // Configure audio for background playback
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          interruptionModeAndroid: 1,
          interruptionModeIOS: 2,
        });
        console.log('✅ Audio configured for background playback');
      } catch (error) {
        console.error('Failed to configure audio:', error);
      }
    };
    
    setupAudio();
    
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  // Track playback progress
  useEffect(() => {
    if (isPlaying && sound) {
      progressInterval.current = setInterval(async () => {
        try {
          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            setCurrentTime(status.positionMillis / 1000);
            setPosition(status.positionMillis / 1000);
          }
        } catch (error) {
          console.error('Progress update error:', error);
        }
      }, 500);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isPlaying, sound]);

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
            if (sound) {
              await sound.stopAsync();
              await sound.unloadAsync();
              setSound(null);
              setPlayingId(null);
              playingIdRef.current = null;
              setIsPlaying(false);
              setCurrentTime(0);
              setPosition(0);
              setMetadata([]);
            }
            console.log('🗑️ History cleared');
            Alert.alert("History Cleared", "Your progress has been reset.");
          } 
        }
      ]
    );
  };

  useEffect(() => {
    if (playingId && position > 0) {
      const save = async () => {
        await AsyncStorage.setItem('last_played_id', playingId);
        await AsyncStorage.setItem('last_played_time', position.toString());
        console.log(`💾 Saved progress for ${playingId}: ${position}s`);
      };
      save();
    }
  }, [playingId, Math.floor(position / 5)]);

  const resumeLastSession = async () => {
    const lastId = await AsyncStorage.getItem('last_played_id');
    const lastTime = await AsyncStorage.getItem('last_played_time');
    
    if (lastId && lastTime) {
      const chapter = chapters.find(c => c.id === lastId);
      if (chapter && offlineIds.has(chapter.id)) {
        console.log(`🔄 Resuming last session: ${chapter.name} at ${lastTime}s`);
        await handlePlay(chapter, parseFloat(lastTime));
      } else {
        console.log('⚠️ Last session chapter not available');
        Alert.alert("Not Available", "The last played chapter is not downloaded.");
      }
    } else {
      console.log('ℹ️ No saved session found');
      Alert.alert("No history", "You don't have a saved session to resume.");
    }
  };

  const handleOfflineToggle = async () => {
    const newState = !showOfflineOnly;
    setShowOfflineOnly(newState);
    console.log('👁️ Filter changed:', newState ? 'Showing only downloaded' : 'Showing all');
    if (newState) {
      const offlineChapters = chapters.filter(c => offlineIds.has(c.id));
      if (offlineChapters.length > 0) {
        resumeLastSession();
      }
    }
  };

  // AUTO-NEXT: Follows the EXACT order of the visible list
  const onPlaybackStatusUpdate = useCallback((status) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      setDuration(status.durationMillis / 1000);
      setCurrentTime(status.positionMillis / 1000);
      setPosition(status.positionMillis / 1000);
      
      if (status.didJustFinish || Math.floor(status.positionMillis/1000) % 30 === 0) {
        logPlaybackStatus(status);
      }
      
      if (status.didJustFinish) {
        const currentPlayingId = playingIdRef.current;
        
        console.log('\n🔴🔴🔴 CHAPTER FINISHED 🔴🔴🔴');
        console.log(`Current playing ID from ref: ${currentPlayingId}`);
        console.log(`Auto-next enabled: ${autoNext ? 'YES' : 'NO'}`);
        
        setIsPlaying(false);
        setCurrentTime(0);
        setPosition(0);
        
        
        if (autoNext && currentPlayingId) {
          
          const currentIndex = visibleChapters.findIndex(c => c.id === currentPlayingId);
          console.log(`📍 Current index in list: ${currentIndex}`);
          console.log(`📊 Total chapters in list: ${visibleChapters.length}`);
          
          if (currentIndex !== -1) {
            if (currentIndex < visibleChapters.length - 1) {
              // Get the very next chapter in the list
              const nextChapter = visibleChapters[currentIndex + 1];
              console.log(`\n➡️➡️➡️ AUTO-NEXT TRIGGERED ⬅️⬅️⬅️`);
              console.log(`   From index ${currentIndex} → ${currentIndex + 1}`);
              console.log(`   Next chapter: ${nextChapter.name}`);
              console.log(`   Next chapter ID: ${nextChapter.id}`);
              
              // Small delay to ensure cleanup
              setTimeout(() => {
                console.log(`\n▶️ Playing next chapter: ${nextChapter.name}`);
                handlePlay(nextChapter, 0);
              }, 500);
            } else {
              console.log('\n🏁 End of list reached - no next chapter');
            }
          } else {
            console.log('❌ Current chapter not found in visible list');
          }
        } else {
          console.log('⏸️ Auto-next not triggered - disabled or no playing ID');
        }
      }
    }
  }, [autoNext, visibleChapters]);

  const handlePlay = useCallback(async (item, startTime = 0) => {
    try {
      console.log(`\n▶️▶️▶️ PLAYING CHAPTER ▶️▶️▶️`);
      console.log(`   Title: ${item.name}`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Start time: ${startTime}s`);
      
      setIsAudioLoading(true);
      
      // Stop and unload current sound
      if (sound) {
        console.log('   Stopping current playback');
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }

      // Set playing ID - both state and ref
      setPlayingId(item.id);
      playingIdRef.current = item.id;
      console.log(`   playingId set to: ${item.id}`);
      
      const audioUri = `${FileSystem.documentDirectory}${item.id}.mp3`;
      const metaUri = `${FileSystem.documentDirectory}${item.id}.json`;

      // Load metadata
      try {
        const info = await FileSystem.getInfoAsync(metaUri);
        if (info.exists) {
          const content = await FileSystem.readAsStringAsync(metaUri);
          const parsedMeta = JSON.parse(content);
          setMetadata(Array.isArray(parsedMeta) ? parsedMeta : []);
          console.log(`   📝 Loaded metadata from cache`);
        } else if (isOnline) {
          console.log(`   🌐 Fetching metadata from server`);
          const res = await fetch(`${API_BASE}/metadata/${item.id}`);
          const data = await res.json();
          setMetadata(Array.isArray(data) ? data : []);
          
          // Cache metadata for offline use
          await FileSystem.writeAsStringAsync(metaUri, JSON.stringify(data));
          console.log(`   💾 Cached metadata`);
        } else {
          console.log(`   ⚠️ No metadata available`);
          setMetadata([]);
        }
      } catch (e) { 
        console.error('Metadata error:', e);
        setMetadata([]); 
      }

      // Check if audio file exists
      const audioInfo = await FileSystem.getInfoAsync(audioUri);
      if (!audioInfo.exists) {
        console.log(`   ❌ Audio file not found: ${audioUri}`);
        Alert.alert("Error", "Audio file not downloaded. Please download it first.");
        setIsAudioLoading(false);
        return;
      }
      
      console.log(`   ✅ Audio file found`);

      // Create and play sound
      console.log(`   🎵 Creating audio player`);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { 
          shouldPlay: true, 
          positionMillis: startTime * 1000,
          androidImplementation: 'MediaPlayer',
        },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
      soundRef.current = newSound;
      console.log(`   ✅ Playback started\n`);
      
    } catch (e) { 
      console.error('Playback error:', e);
      Alert.alert("Playback Error", "Could not play this audio file.");
      setMetadata([]); 
    } finally {
      setIsAudioLoading(false);
    }
  }, [sound, isOnline, onPlaybackStatusUpdate]);

  const togglePlayPause = async () => {
    if (!sound) return;
    
    try {
      if (isPlaying) {
        await sound.pauseAsync();
        console.log('⏸️ Paused');
      } else {
        await sound.playAsync();
        console.log('▶️ Resumed');
      }
    } catch (error) {
      console.error('Toggle play/pause error:', error);
    }
  };

  const seekForward = async () => {
    if (!sound) return;
    
    try {
      const newPosition = Math.min(position + 10, duration);
      await sound.setPositionAsync(newPosition * 1000);
      console.log(`⏩ Seek forward to ${newPosition}s`);
    } catch (error) {
      console.error('Seek error:', error);
    }
  };

  const seekBackward = async () => {
    if (!sound) return;
    
    try {
      const newPosition = Math.max(position - 10, 0);
      await sound.setPositionAsync(newPosition * 1000);
      console.log(`⏪ Seek backward to ${newPosition}s`);
    } catch (error) {
      console.error('Seek error:', error);
    }
  };

  const seekTo = async (time) => {
    if (!sound) return;
    
    try {
      await sound.setPositionAsync(time * 1000);
      console.log(`🎯 Seek to ${time}s`);
    } catch (error) {
      console.error('Seek error:', error);
    }
  };

  const refreshChapters = async () => {
    setIsRefreshing(true);
    console.log('🔄 Refreshing chapters...');
    
    try {
      const isAvailable = await checkServerAvailability();
      
      if (!isAvailable) {
        console.log('📡 Server unavailable - staying offline');
        Alert.alert(
          "Offline", 
          "You're offline. Showing downloaded chapters only.",
          [{ text: "OK" }]
        );
        setIsRefreshing(false);
        return;
      }

      const res = await fetch(`${API_BASE}/chapters?limit=1000`);
      const data = await res.json();
      const chaptersData = data.items || [];
      
      console.log(`📥 Fetched ${chaptersData.length} chapters from server`);
      
      // Cache the chapters (preserve original order)
      await cacheChapters(chaptersData);
      setChapters(chaptersData);
      
      // Update offline IDs
      const offline = new Set();
      for (const chapter of chaptersData) {
        const audioUri = `${FileSystem.documentDirectory}${chapter.id}.mp3`;
        try {
          const info = await FileSystem.getInfoAsync(audioUri);
          if (info.exists) {
            offline.add(chapter.id);
          }
        } catch (e) {}
      }
      setOfflineIds(offline);
      console.log(`📱 Found ${offline.size} downloaded files`);
      
      
      Alert.alert("Success", "Chapters updated successfully!");
      
    } catch (error) {
      console.error('Refresh error:', error);
      Alert.alert("Error", "Failed to refresh chapters.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      console.log('\n🚀 APP INITIALIZING...\n');
      
      try {
        // Load cached chapters first (preserves order)
        await loadCachedChapters();
        
        // Then try to fetch fresh data if online
        if (isOnline) {
          try {
            console.log('🌐 Online - fetching fresh chapters...');
            const res = await fetch(`${API_BASE}/chapters?limit=1000`);
            const data = await res.json();
            const chaptersData = data.items || [];
            // Don't sort - preserve API order
            await cacheChapters(chaptersData);
            setChapters(chaptersData);
            console.log(`📥 Fetched ${chaptersData.length} chapters from server`);
          } catch (error) {
            console.log('⚠️ Using cached chapters due to fetch error');
          }
        } else {
          console.log('📡 Offline - using cached chapters only');
        }

        // Check which chapters are downloaded
        console.log('🔍 Scanning for downloaded files...');
        const offline = new Set();
        const currentChapters = chapters.length > 0 ? chapters : 
          await loadCachedChapters() ? JSON.parse(await AsyncStorage.getItem(CHAPTERS_CACHE_KEY)) : [];
        
        for (const chapter of currentChapters) {
          const audioUri = `${FileSystem.documentDirectory}${chapter.id}.mp3`;
          try {
            const info = await FileSystem.getInfoAsync(audioUri);
            if (info.exists) {
              offline.add(chapter.id);
            }
          } catch (e) {}
        }
        
        setOfflineIds(offline);
        console.log(`📱 Found ${offline.size} downloaded files`);
        
        
      } catch (error) {
        console.error('Init error:', error);
      } finally { 
        setLoading(false);
        console.log('✅ App initialization complete\n');
      }
    };
    
    init();
  }, [isOnline]);

  const visibleChapters = useMemo(() => {
    let filtered = [];
    
    if (!isOnline) {
      // When offline, show downloaded chapters in their ORIGINAL order
      filtered = chapters.filter(c => offlineIds.has(c.id));
    } else if (showOfflineOnly) {
      // When showing only downloaded, preserve the ORIGINAL order
      filtered = chapters.filter(c => offlineIds.has(c.id));
    } else {
      // When showing all chapters, sort them for better organization
      filtered = sortChapters(chapters);
    }
    
    return filtered;
  }, [chapters, offlineIds, showOfflineOnly, isOnline]);

  // Log visible chapters whenever they change


  // Debug: Monitor playing ID and next chapter
  useEffect(() => {
    if (playingId && visibleChapters.length > 0) {
      const currentIndex = visibleChapters.findIndex(c => c.id === playingId);
      if (currentIndex !== -1) {
        console.log(`\n🎯 Currently playing at index ${currentIndex}`);
        if (currentIndex < visibleChapters.length - 1) {
          console.log(`⏭️ Next in queue: ${visibleChapters[currentIndex + 1]?.name}`);
        } else {
          console.log(`🏁 This is the last chapter in the list`);
        }
      }
    }
  }, [playingId, visibleChapters]);

  const missingChapters = useMemo(() => 
    chapters.filter(c => c.is_ready && !offlineIds.has(c.id)), 
    [chapters, offlineIds]
  );

  const startDownload = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "Cannot download while offline. Please connect to the internet.");
      return;
    }

    const toDownload = chapters.filter(c => selectedForDownload.has(c.id));
    setIsSyncModalVisible(false);
    
    console.log(`\n⬇️ Starting download of ${toDownload.length} chapters:`);
    
    for (const chapter of toDownload) {
      try {
        const audioUri = `${FileSystem.documentDirectory}${chapter.id}.mp3`;
        const metaUri = `${FileSystem.documentDirectory}${chapter.id}.json`;
        
        console.log(`   Downloading: ${chapter.name}`);
        
        await Promise.all([
          FileSystem.downloadAsync(`${API_BASE}/download/${chapter.id}`, audioUri),
          FileSystem.downloadAsync(`${API_BASE}/metadata/${chapter.id}`, metaUri)
        ]);
        
        setOfflineIds(prev => {
          const newSet = new Set([...prev, chapter.id]);
          console.log(`   ✅ Downloaded: ${chapter.name} (Total offline: ${newSet.size})`);
          return newSet;
        });
      } catch (err) { 
        console.error(`   ❌ Download error for ${chapter.name}:`, err); 
        Alert.alert("Download Error", `Failed to download ${chapter.name}`);
      }
    }
    setSelectedForDownload(new Set());
    console.log('✅ Download batch complete\n');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      
      {/* Header with brand and controls */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandContainer}>
            <Text style={styles.brand}>MVS<Text style={{color: '#3b82f6'}}>AUDIO</Text></Text>
            {!isOnline && (
              <View style={styles.offlineBadge}>
                <WifiOff size={14} color="#ef4444" />
                <Text style={styles.offlineText}>Offline Mode</Text>
              </View>
            )}
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              onPress={refreshChapters} 
              style={[styles.iconBtn, isRefreshing && styles.iconBtnDisabled]}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <RefreshCw size={20} color={isOnline ? "#3b82f6" : "#64748b"} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={clearHistory} style={styles.iconBtn}>
              <Trash2 size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.pillRow}>
          <TouchableOpacity 
            style={[styles.pill, (showOfflineOnly || !isOnline) && styles.pillActive]} 
            onPress={handleOfflineToggle}
            disabled={!isOnline}
          >
            <Library size={14} color={(showOfflineOnly || !isOnline) ? "white" : "#94a3b8"} />
            <Text style={[styles.pillText, (showOfflineOnly || !isOnline) && {color: 'white'}]}>
              Downloaded ({offlineIds.size})
            </Text>
          </TouchableOpacity>
          
          {isOnline && missingChapters.length > 0 && (
            <TouchableOpacity style={styles.pill} onPress={() => setIsSyncModalVisible(true)}>
              <DownloadCloud size={14} color="#94a3b8" />
              <Text style={styles.pillText}>Available ({missingChapters.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Auto-next toggle */}
        <View style={styles.autoNextRow}>
          <View style={styles.autoNextLeft}>
            <RotateCcw size={16} color={autoNext ? "#3b82f6" : "#64748b"} />
            <Text style={[styles.autoNextText, autoNext && styles.autoNextActive]}>
              Auto-play next chapter
            </Text>
          </View>
          <Switch
            value={autoNext}
            onValueChange={toggleAutoNext}
            trackColor={{ false: '#1e293b', true: '#3b82f6' }}
            thumbColor={autoNext ? '#ffffff' : '#94a3b8'}
          />
        </View>
      </View>

      {/* Chapters List */}
      <View style={[
        styles.chaptersContainer,
        playingId ? styles.chaptersWithPlayer : styles.chaptersFullScreen
      ]}>
        {!isOnline && (
          <View style={styles.offlineWarning}>
            <WifiOff size={16} color="#ef4444" />
            <Text style={styles.offlineWarningText}>
              You're offline - showing only downloaded chapters
            </Text>
          </View>
        )}
        
        <FlatList 
          data={visibleChapters}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chaptersList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {!isOnline 
                  ? "No downloaded chapters available" 
                  : showOfflineOnly 
                    ? "No downloaded chapters" 
                    : "No chapters available"}
              </Text>
              {!isOnline && (
                <Text style={styles.emptySubText}>
                  Go online to download chapters
                </Text>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const isOffline = offlineIds.has(item.id);
            const isCurrentlyPlaying = playingId === item.id;
            
            return (
              <TouchableOpacity 
                style={[styles.row, isCurrentlyPlaying && styles.rowActive]} 
                onPress={() => {
                  if (isOffline) {
                    handlePlay(item);
                  } else if (isOnline) {
                    Alert.alert("Not Downloaded", "Please download this chapter first.");
                  } else {
                    Alert.alert("Offline", "This chapter is not downloaded. Go online to download it.");
                  }
                }}
              >
                <View style={styles.rowLeft}>
                  <Text style={[
                    styles.rowTitle, 
                    isCurrentlyPlaying && {color: '#3b82f6'},
                    !isOffline && styles.rowDisabled
                  ]} numberOfLines={1}>
                    {index + 1}. {item.name}
                  </Text>
                  <Text style={styles.rowSub}>
                    {isOffline ? "📱 Downloaded" : "☁️ Online"}
                  </Text>
                </View>
                {isOffline ? (
                  <CheckCircle2 size={18} color="#10b981" />
                ) : (
                  <DownloadCloud size={18} color="#475569" />
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Download Modal */}
      <Modal visible={isSyncModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalTop}>
              <Text style={styles.modalHeading}>Available to Download</Text>
              <View style={styles.modalHeaderButtons}>
                {selectedForDownload.size > 0 && (
                  <TouchableOpacity 
                    onPress={clearSelectedDownloads}
                    style={styles.modalHeaderBtn}
                  >
                    <ListX size={20} color="#ef4444" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setIsSyncModalVisible(false)}>
                  <X color="white" size={24} />
                </TouchableOpacity>
              </View>
            </View>
            
            {selectedForDownload.size > 0 && (
              <View style={styles.selectionInfo}>
                <Text style={styles.selectionText}>
                  {selectedForDownload.size} chapter{selectedForDownload.size !== 1 ? 's' : ''} selected
                </Text>
                <TouchableOpacity onPress={clearSelectedDownloads}>
                  <Text style={styles.clearSelectionText}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <ScrollView style={{maxHeight: 400}}>
              {missingChapters.map(ch => (
                <TouchableOpacity 
                  key={ch.id} 
                  style={styles.selectRow} 
                  onPress={() => {
                    const n = new Set(selectedForDownload);
                    n.has(ch.id) ? n.delete(ch.id) : n.add(ch.id);
                    setSelectedForDownload(n);
                  }}
                >
                  {selectedForDownload.has(ch.id) ? (
                    <CheckSquare color="#3b82f6" size={24} />
                  ) : (
                    <Square color="#475569" size={24} />
                  )}
                  <Text style={styles.selectText} numberOfLines={1}>{ch.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <View style={styles.modalFooter}>
              {selectedForDownload.size > 0 && (
                <TouchableOpacity 
                  style={styles.clearAllBtn}
                  onPress={clearSelectedDownloads}
                >
                  <ListX size={20} color="#ef4444" />
                  <Text style={styles.clearAllText}>Clear All</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[
                  styles.actionBtn, 
                  selectedForDownload.size === 0 && styles.actionBtnDisabled,
                  !selectedForDownload.size && { flex: 1 }
                ]} 
                onPress={startDownload}
                disabled={selectedForDownload.size === 0}
              >
                <Text style={styles.actionBtnText}>
                  Download {selectedForDownload.size} Item{selectedForDownload.size !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Player Section */}
      {playingId && (
        <View style={styles.playerWrapper}>
          {/* Transcript Toggle */}
          <TouchableOpacity 
            style={styles.transcriptToggle}
            onPress={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
          >
            <Text style={styles.transcriptToggleText}>
              Transcript {isTranscriptExpanded ? '▼' : '▲'}
            </Text>
            {isTranscriptExpanded ? (
              <ChevronDown color="#94a3b8" size={20} />
            ) : (
              <ChevronUp color="#94a3b8" size={20} />
            )}
          </TouchableOpacity>

          {/* Transcript View */}
          {isTranscriptExpanded && (
            <View style={styles.transcriptContainer}>
              {metadata && metadata.length > 0 ? (
                <TranscriptView 
                  metadata={metadata} 
                  currentTime={currentTime || 0} 
                  onSeek={seekTo} 
                />
              ) : (
                <View style={styles.noTranscript}>
                  <Text style={styles.noTranscriptText}>
                    {!isOnline 
                      ? "Transcript unavailable offline" 
                      : "No transcript available"}
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {/* Player Controls */}
          <View style={[
            styles.playerControls,
            !isTranscriptExpanded && styles.playerControlsExpanded
          ]}>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${(currentTime / (duration || 1)) * 100}%` }
                  ]} 
                />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(currentTime || 0)}</Text>
                <Text style={styles.timeText}>{formatTime(duration || 0)}</Text>
              </View>
            </View>
            
            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={seekBackward} style={styles.controlBtn}>
                <SkipBack size={24} color="white" />
                <Text style={styles.controlLabel}>-10s</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={togglePlayPause} 
                style={styles.playBtn}
                disabled={isAudioLoading}
              >
                {isAudioLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : isPlaying ? (
                  <Pause size={32} color="white" />
                ) : (
                  <Play size={32} color="white" />
                )}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={seekForward} style={styles.controlBtn}>
                <SkipForward size={24} color="white" />
                <Text style={styles.controlLabel}>+10s</Text>
              </TouchableOpacity>
            </View>
            
            {/* Auto-next indicator */}
            {autoNext && (
              <View style={styles.autoNextIndicator}>
                <RotateCcw size={12} color="#3b82f6" />
                <Text style={styles.autoNextIndicatorText}>
                  Auto-next enabled
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#020617' 
  },
  center: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#020617' 
  },
  header: { 
    padding: 20, 
    paddingBottom: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    zIndex: 10,
  },
  headerTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 15 
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brand: { 
    color: 'white', 
    fontSize: 24, 
    fontWeight: '900' 
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  offlineText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: { 
    padding: 10, 
    backgroundColor: '#1e293b', 
    borderRadius: 10 
  },
  iconBtnDisabled: {
    opacity: 0.5,
  },
  pillRow: { 
    flexDirection: 'row', 
    gap: 10,
    marginBottom: 12,
  },
  pill: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1e293b', 
    padding: 10, 
    paddingHorizontal: 16, 
    borderRadius: 25, 
    gap: 8 
  },
  pillActive: { 
    backgroundColor: '#3b82f6' 
  },
  pillText: { 
    color: '#94a3b8', 
    fontSize: 14, 
    fontWeight: '600' 
  },
  autoNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 12,
    marginTop: 5,
  },
  autoNextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoNextText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },
  autoNextActive: {
    color: '#3b82f6',
  },
  chaptersContainer: {
    flex: 1,
  },
  chaptersFullScreen: {
    flex: 1,
  },
  chaptersWithPlayer: {
    flex: 1,
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  chaptersList: {
    padding: 20,
    paddingBottom: 20,
  },
  offlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 12,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
    borderRadius: 8,
    gap: 8,
  },
  offlineWarningText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 16, 
    paddingHorizontal: 12,
    borderBottomWidth: 1, 
    borderBottomColor: '#1e293b',
    borderRadius: 8,
    marginBottom: 4
  },
  rowActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  rowLeft: {
    flex: 1,
    marginRight: 10,
  },
  rowTitle: { 
    color: 'white', 
    fontSize: 16, 
    fontWeight: '500' 
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowSub: { 
    color: '#64748b', 
    fontSize: 12, 
    marginTop: 4 
  },
  playerWrapper: { 
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    height: SCREEN_HEIGHT * 0.5,
  },
  transcriptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
  },
  transcriptToggleText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  transcriptContainer: {
    flex: 1,
    maxHeight: SCREEN_HEIGHT * 0.25,
    backgroundColor: '#0f172a',
  },
  playerControls: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  playerControlsExpanded: {
    paddingTop: 20,
    marginTop: 'auto',
  },
  progressContainer: {
    marginBottom: 20
  },
  progressBar: { 
    height: 4, 
    backgroundColor: '#1e293b', 
    borderRadius: 2,
    marginBottom: 8
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: '#3b82f6', 
    borderRadius: 2 
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: { 
    color: '#94a3b8', 
    fontSize: 12,
    fontFamily: 'monospace'
  },
  controlsRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 30 
  },
  controlBtn: { 
    alignItems: 'center',
    padding: 10
  },
  controlLabel: { 
    color: '#94a3b8', 
    fontSize: 10, 
    marginTop: 4 
  },
  playBtn: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: '#3b82f6', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  autoNextIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  autoNextIndicatorText: {
    color: '#3b82f6',
    fontSize: 11,
  },
  noTranscript: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 10,
  },
  noTranscriptText: {
    color: '#64748b',
    fontSize: 14,
  },
  modalBackdrop: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.9)', 
    justifyContent: 'flex-end' 
  },
  modalSheet: { 
    backgroundColor: '#0f172a', 
    padding: 24, 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30,
    maxHeight: '80%'
  },
  modalTop: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 16
  },
  modalHeading: { 
    color: 'white', 
    fontSize: 20, 
    fontWeight: 'bold' 
  },
  modalHeaderButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  modalHeaderBtn: {
    padding: 4,
  },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectionText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  clearSelectionText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  selectRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#1e293b',
    gap: 12
  },
  selectText: { 
    color: 'white', 
    fontSize: 14,
    flex: 1
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 15,
    gap: 8,
  },
  clearAllText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  actionBtn: { 
    backgroundColor: '#3b82f6', 
    padding: 18, 
    borderRadius: 15, 
    alignItems: 'center',
    flex: 2,
  },
  actionBtnDisabled: {
    backgroundColor: '#475569',
    opacity: 0.5
  },
  actionBtnText: { 
    color: 'white', 
    fontWeight: 'bold',
    fontSize: 16
  }
});