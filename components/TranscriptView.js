import React, { useEffect, useRef, useMemo } from 'react';
import { FlatList, Text, TouchableOpacity, StyleSheet, View } from 'react-native';

export default function TranscriptView({ metadata = [], currentTime, onSeek }) {
  const listRef = useRef(null);

  // Find the current line based on audio time
  const activeIndex = useMemo(() => 
    metadata.findIndex(m => currentTime >= m.start && currentTime <= m.end), 
    [currentTime, metadata]
  );

  useEffect(() => {
    if (activeIndex !== -1 && listRef.current) {
      listRef.current.scrollToIndex({ index: activeIndex, viewPosition: 0.5, animated: true });
    }
  }, [activeIndex]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={metadata}
        keyExtractor={(_, i) => i.toString()}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item, index }) => (
          <TouchableOpacity onPress={() => onSeek(item.start)} style={styles.line}>
            <Text style={[styles.text, index === activeIndex ? styles.active : styles.inactive]}>
              {item.text}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  line: { paddingVertical: 8, paddingHorizontal: 16 },
  text: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  active: { color: '#3b82f6', fontWeight: 'bold', opacity: 1 },
  inactive: { color: '#94a3b8', opacity: 0.5 },
});