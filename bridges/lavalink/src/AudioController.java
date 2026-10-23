package dev.yuzuha.audio;

import dev.arbjerg.lavalink.api.IPlayer;
import dev.arbjerg.lavalink.api.ISocketContext;
import dev.arbjerg.lavalink.api.ISocketServer;
import dev.arbjerg.lavalink.api.PluginEventHandler;
import com.sedmelluq.discord.lavaplayer.format.StandardAudioDataFormats;
import com.sedmelluq.discord.lavaplayer.track.playback.MutableAudioFrame;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.AsyncContext;
import jakarta.servlet.AsyncEvent;
import jakarta.servlet.AsyncListener;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

@RestController
public final class AudioController extends PluginEventHandler {
    private final ObjectProvider<ISocketServer> server;
    private final int limit;
    private final Map<String, AudioStream> streams = new ConcurrentHashMap<>();
    private final ScheduledExecutorService clock = Executors.newScheduledThreadPool(2, task -> {
        Thread thread = new Thread(task, "yuzuha-audio");
        thread.setDaemon(true);
        return thread;
    });

    public AudioController(ObjectProvider<ISocketServer> server, @Value("${plugins.yuzuha-audio.max-streams:128}") int limit) {
        if (limit < 1 || limit > 10000) throw new IllegalArgumentException("max-streams must be 1..10000");
        this.server = server;
        this.limit = limit;
    }

    @GetMapping("/v4/yuzuha/info")
    public Map<String, Object> info() {
        return Map.of("protocol", 1, "format", "webm-opus", "sampleRate", 48000, "channels", 2,
            "frameDurationMs", 20, "maxStreams", limit, "activeStreams", streams.size());
    }

    @GetMapping("/v4/yuzuha/sessions/{sessionId}/players/{guildId}/audio")
    public void audio(@PathVariable String sessionId, @PathVariable long guildId,
                      HttpServletRequest request, HttpServletResponse response) throws IOException {
        ISocketContext context = server.getObject().getSessions().get(sessionId);
        if (context == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown active session");
        if (guildId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid guild");
        String key = sessionId + ":" + guildId;
        synchronized (streams) {
            if (streams.containsKey(key)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Audio stream already open");
            if (streams.size() >= limit) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Audio stream capacity reached");
            IPlayer player = context.getPlayer(guildId);
            response.setContentType("audio/webm");
            response.setHeader("X-Yuzuha-Audio-Version", "1");
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Accel-Buffering", "no");
            response.setBufferSize(1024);
            AsyncContext async = request.startAsync();
            async.setTimeout(0);
            AudioStream stream = new AudioStream(key, player, async, response.getOutputStream());
            streams.put(key, stream);
            try { stream.start(); }
            catch (RuntimeException failure) { stream.close(); throw failure; }
        }
    }

    @Override public void onDestroyPlayer(ISocketContext context, IPlayer player) {
        AudioStream stream = streams.get(context.getSessionId() + ":" + player.getGuildId());
        if (stream != null) stream.close();
    }
    @Override public void onSocketContextDestroyed(ISocketContext context) {
        streams.forEach((key, stream) -> { if (key.startsWith(context.getSessionId() + ":")) stream.close(); });
    }
    @PreDestroy public void destroy() { streams.values().forEach(AudioStream::close); clock.shutdownNow(); }
    @EventListener public void onShutdown(ContextClosedEvent event) { destroy(); }

    private final class AudioStream implements WriteListener, AsyncListener {
        private final String key;
        private final IPlayer player;
        private final AsyncContext async;
        private final ServletOutputStream output;
        private final byte[] frameData = new byte[StandardAudioDataFormats.DISCORD_OPUS.maximumChunkSize()];
        private final MutableAudioFrame frame = new MutableAudioFrame(ByteBuffer.wrap(frameData));
        private ScheduledFuture<?> task;
        private boolean closed;
        private boolean header;
        private long timestamp;
        private long lastWrite = System.nanoTime();

        AudioStream(String key, IPlayer player, AsyncContext async, ServletOutputStream output) {
            this.key = key; this.player = player; this.async = async; this.output = output;
        }
        synchronized void start() {
            async.addListener(this);
            output.setWriteListener(this);
            task = clock.scheduleAtFixedRate(this::tick, 0, 20, TimeUnit.MILLISECONDS);
        }
        private synchronized void tick() {
            if (closed) return;
            if (player.getSocketContext().getState() == ISocketContext.State.DESTROYED
                || player.getSocketContext().getPlayers().get(player.getGuildId()) != player) { close(); return; }
            try {
                if (!output.isReady()) {
                    if (System.nanoTime() - lastWrite > TimeUnit.SECONDS.toNanos(15)) close();
                    return;
                }
                if (!header) { output.write(WebmOpus.HEADER); header = true; }
                if (!output.isReady()) return;
                boolean provided = player.getAudioPlayer().provide(frame) && !frame.isTerminator();
                output.write(WebmOpus.frame(timestamp, provided ? frameData : WebmOpus.SILENCE,
                    provided ? frame.getDataLength() : WebmOpus.SILENCE.length));
                timestamp += 20;
                output.flush();
                lastWrite = System.nanoTime();
            } catch (IOException | RuntimeException failure) { close(); }
        }
        synchronized void close() {
            if (closed) return;
            closed = true;
            if (task != null) task.cancel(false);
            streams.remove(key, this);
            try { async.complete(); } catch (IllegalStateException | RejectedExecutionException ignored) { }
        }
        @Override public void onWritePossible() { /* The clock paces consumption, including after backpressure. */ }
        @Override public void onError(Throwable error) { close(); }
        @Override public void onComplete(AsyncEvent event) { close(); }
        @Override public void onTimeout(AsyncEvent event) { close(); }
        @Override public void onError(AsyncEvent event) { close(); }
        @Override public void onStartAsync(AsyncEvent event) { }
    }
}
