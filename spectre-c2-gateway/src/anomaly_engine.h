// =============================================================================
// S.P.E.C.T.R.E. Sprint D — Edge-AI Anomaly Detection Engine
// Header-only implementation: Ring Buffer, Feature Extraction,
// StandardScaler, Isolation Forest Inference, EWMA Smoothing
// =============================================================================
#ifndef ANOMALY_ENGINE_H
#define ANOMALY_ENGINE_H

#include <math.h>
#include <string.h>
#include "if_model_data.h"

// ---------------------------------------------------------------------------
// Ring Buffer — fixed-size circular buffer for rolling statistics
// ---------------------------------------------------------------------------
template <typename T, int N>
class RingBuffer {
public:
    RingBuffer() : count_(0), head_(0) {
        memset(buf_, 0, sizeof(buf_));
    }

    void push(T val) {
        buf_[head_] = val;
        head_ = (head_ + 1) % N;
        if (count_ < N) count_++;
    }

    int count() const { return count_; }
    bool full()  const { return count_ >= N; }

    T mean() const {
        if (count_ == 0) return (T)0;
        T sum = (T)0;
        for (int i = 0; i < count_; i++) sum += buf_[i];
        return sum / (T)count_;
    }

    T stddev() const {
        if (count_ < 2) return (T)0;
        T m = mean();
        T sum_sq = (T)0;
        for (int i = 0; i < count_; i++) {
            T diff = buf_[i] - m;
            sum_sq += diff * diff;
        }
        return sqrtf(sum_sq / (T)count_);
    }

private:
    T   buf_[N];
    int count_;
    int head_;
};

// ---------------------------------------------------------------------------
// Feature Extractor — maintains ring buffers, computes 8 features
// ---------------------------------------------------------------------------
// Features:
//   0: rssi               (direct)
//   1: snr                (direct)
//   2: noise_floor        (rssi - snr)
//   3: rssi_delta         (current - previous)
//   4: noise_floor_delta  (current - previous)
//   5: rssi_roll_mean_10  (rolling mean of RSSI over 10)
//   6: rssi_roll_std_10   (rolling std of RSSI over 10)
//   7: nf_roll_std_10     (rolling std of noise_floor over 10)
// ---------------------------------------------------------------------------
class FeatureExtractor {
public:
    FeatureExtractor()
        : prevRssi_(0.0f), prevNF_(0.0f), hasFirst_(false) {}

    // Returns true if ring buffer is fully populated (ready for inference)
    bool update(float rssi, float snr, float features[IF_N_FEATURES]) {
        float nf = rssi - snr;

        // Deltas
        float rssiDelta = hasFirst_ ? (rssi - prevRssi_) : 0.0f;
        float nfDelta   = hasFirst_ ? (nf - prevNF_)     : 0.0f;
        prevRssi_ = rssi;
        prevNF_   = nf;
        hasFirst_ = true;

        // Push into ring buffers
        rssiBuf_.push(rssi);
        nfBuf_.push(nf);

        // Build feature vector
        features[0] = rssi;
        features[1] = snr;
        features[2] = nf;
        features[3] = rssiDelta;
        features[4] = nfDelta;
        features[5] = rssiBuf_.mean();
        features[6] = rssiBuf_.stddev();
        features[7] = nfBuf_.stddev();

        return rssiBuf_.full();
    }

private:
    RingBuffer<float, 10> rssiBuf_;
    RingBuffer<float, 10> nfBuf_;
    float prevRssi_;
    float prevNF_;
    bool  hasFirst_;
};

// ---------------------------------------------------------------------------
// Standard Scaler — normalizes features using pre-computed mean/std
// ---------------------------------------------------------------------------
static inline void scalerTransform(float features[IF_N_FEATURES]) {
    for (int i = 0; i < IF_N_FEATURES; i++) {
        if (SCALER_STD[i] > 1e-8f) {
            features[i] = (features[i] - SCALER_MEAN[i]) / SCALER_STD[i];
        } else {
            features[i] = 0.0f;
        }
    }
}

// ---------------------------------------------------------------------------
// Isolation Forest Inference — iterative tree traversal, anomaly scoring
// ---------------------------------------------------------------------------
static inline float ifComputeScore(const float scaled[IF_N_FEATURES]) {
    float totalPathLength = 0.0f;

    for (int t = 0; t < IF_N_TREES; t++) {
        int node = 0;
        int depth = 0;
        int treeSize = IF_TREE_SIZES[t];

        while (node >= 0 && node < treeSize) {
            const IFNode& n = IF_TREES[t][node];
            if (n.feature < 0) break;   // leaf node (feature == -2)
            if (scaled[n.feature] <= n.threshold) {
                node = n.left;
            } else {
                node = n.right;
            }
            depth++;
        }
        totalPathLength += (float)depth;
    }

    float avgPath = totalPathLength / (float)IF_N_TREES;

    // Anomaly score: s(x) = 2^(-avgPath / c(n))
    // Higher score = more anomalous
    float score = powf(2.0f, -avgPath / IF_C_N);
    return score;
}

// ---------------------------------------------------------------------------
// Anomaly Engine — top-level API combining all components
// ---------------------------------------------------------------------------
class AnomalyEngine {
public:
    AnomalyEngine()
        : ewmaScore_(0.0f), initialized_(false) {}

    // Main entry point: feed raw RSSI and SNR, get anomaly score 0.0–1.0
    float computeScore(float rssi, float snr) {
        float features[IF_N_FEATURES];

        bool ready = extractor_.update(rssi, snr, features);
        if (!ready) {
            // Ring buffer not yet full — return safe default
            return 0.0f;
        }

        // Normalize
        scalerTransform(features);

        // Inference
        float rawScore = ifComputeScore(features);

        // Clamp to [0.0, 1.0]
        if (rawScore < 0.0f) rawScore = 0.0f;
        if (rawScore > 1.0f) rawScore = 1.0f;

        // EWMA smoothing (alpha = 0.3)
        if (!initialized_) {
            ewmaScore_ = rawScore;
            initialized_ = true;
        } else {
            ewmaScore_ = 0.3f * rawScore + 0.7f * ewmaScore_;
        }

        return ewmaScore_;
    }

private:
    FeatureExtractor extractor_;
    float ewmaScore_;
    bool  initialized_;
};

#endif // ANOMALY_ENGINE_H
