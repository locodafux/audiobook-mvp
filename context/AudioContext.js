import React, { createContext, useContext, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

const AudioContext = createContext();

export const AudioProvider = ({ children }) => {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const value = {
    player,
    status,
    playingId,
    setPlayingId,
    metadata,
    setMetadata,
    playbackSpeed,
    setPlaybackSpeed,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = () => useContext(AudioContext);