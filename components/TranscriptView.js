import React, { useEffect, useRef, useMemo } from 'react';
import { FlatList, Text, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function TranscriptView({ metadata, currentTime, onSeek }) {
  const listRef = useRef(null);

  // Find the current line of text based on audio time
  const activeIndex = useMemo(() => 
    metadata.findIndex(m => currentTime >= m.start && currentTime <= m.end), 
    [currentTime, metadata]
  );

  // Auto-scroll to the active line
  useEffect(() => {
    if (activeIndex !== -1 && listRef.current) {
      listRef.current.scrollToIndex({ index: activeIndex, viewPosition: 0.5, animated: true });
    }
  }, [activeIndex]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={metadata}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={{ paddingVertical: 100 }}
        onScrollToIndexFailed={() => {}}
        showsVerticalScrollIndicator={false}
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
  line: { paddingVertical: 12, paddingHorizontal: 30 },
  text: { fontSize: 19, textAlign: 'center', lineHeight: 28 },
  active: { color: '#3b82f6', fontWeight: 'bold', opacity: 1 },
  inactive: { color: '#94a3b8', opacity: 0.3 }
});