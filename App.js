import React, { useEffect, useState } from 'react';
import { SafeAreaView, FlatList, Text, View, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { CheckCircle2, Download } from 'lucide-react-native';

const API_BASE = "http://192.168.8.104";

export default function CachedChaptersDownload() {
  const [chapters, setChapters] = useState([]);
  const [cachedIds, setCachedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    fetchChapters();
  }, []);

  const fetchChapters = async () => {
    setLoading(true);
    try {
      const [chapRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/book/chapters`),
        fetch(`${API_BASE}/book/status`)
      ]);
      const chapData = await chapRes.json();
      const statusData = await statusRes.json();
      setChapters(chapData);
      setCachedIds(new Set(statusData));
    } catch (e) {
      console.error("Error fetching chapters:", e);
    } finally {
      setLoading(false);
    }
  };

const downloadChapter = async (chapter) => {
  setDownloadingId(chapter.id);

  try {
    const res = await fetch(`${API_BASE}/tts/chapter?epub_item_id=${chapter.id}`);
    const data = await res.json();

    if (data.error) {
      return Alert.alert("Not cached", data.error);
    }

    let fileUri = FileSystem.documentDirectory + `${chapter.name}.mp3`;

    if (data.audio_url) {
      // Download from URL
      const downloadRes = await FileSystem.downloadAsync(data.audio_url, fileUri);
      fileUri = downloadRes.uri;
    } else if (data.audio) {
      // Decode base64
      await FileSystem.writeAsStringAsync(fileUri, data.audio, { encoding: FileSystem.EncodingType.Base64 });
    } else {
      return Alert.alert("Error", "No audio found for this chapter");
    }

    Alert.alert("Downloaded!", `Saved to: ${fileUri}`);
  } catch (e) {
    console.error(e);
    Alert.alert("Download failed", e.message);
  } finally {
    setDownloadingId(null);
  }
};
  const renderItem = ({ item }) => {
    const isCached = cachedIds.has(item.id);
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isCached && <CheckCircle2 size={20} color="#10b981" style={{ marginRight: 10 }} />}
          {isCached && (
            <TouchableOpacity onPress={() => downloadChapter(item)} disabled={downloadingId === item.id}>
              {downloadingId === item.id ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Download size={20} color="#007AFF" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={chapters}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 20 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  title: { color: 'white', fontSize: 16, fontWeight: '600' },
});