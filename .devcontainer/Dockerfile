FROM node:22-bookworm

# Tools, shell niceties, and Chromium for the Playwright MCP and screenshots.
RUN apt-get update -qq && apt-get install -y \
    build-essential \
    git \
    curl \
    wget \
    vim \
    zsh \
    sudo \
    readline-common \
    libreadline-dev \
    ncurses-base \
    ncurses-term \
    fzf \
    ripgrep \
    bat \
    exa \
    zsh-syntax-highlighting \
    zsh-autosuggestions \
    htop \
    jq \
    chromium \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# The workspace is /ramify, not /app: Claude Code and Codex key their per-project
# state by absolute path, and ~/.claude is shared with a cucumber-viz devcontainer
# on the same host whose workspace is /app.
ENV APP_HOME=/ramify

# node:22-bookworm ships a `node` user at uid/gid 1000, which collides with the
# host user on native-Linux Docker and makes the bind-mounted workspace
# read-only. Free 1000 and pin `app` to it so it owns the mounted files.
ARG USER_UID=1000
ARG USER_GID=1000
RUN userdel -r node 2>/dev/null || true; groupdel node 2>/dev/null || true; \
    groupadd -g ${USER_GID} app && \
    useradd -m -u ${USER_UID} -g ${USER_GID} -s /usr/bin/zsh app && \
    mkdir -p $APP_HOME/node_modules $APP_HOME/site/node_modules \
             $APP_HOME/examples/collection-review/node_modules && \
    chown -R app:app $APP_HOME && \
    usermod -aG sudo app && \
    echo 'app ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER app

WORKDIR $APP_HOME

# Readline and shell defaults.
RUN echo 'set enable-bracketed-paste off' >> /home/app/.inputrc && \
    echo 'set editing-mode emacs' >> /home/app/.inputrc && \
    echo '"\e[A": history-search-backward' >> /home/app/.inputrc && \
    echo '"\e[B": history-search-forward' >> /home/app/.inputrc && \
    echo 'set show-all-if-ambiguous on' >> /home/app/.inputrc && \
    echo 'set completion-ignore-case on' >> /home/app/.inputrc && \
    echo 'export TERM=xterm-256color' >> /home/app/.bashrc && \
    echo 'export HISTSIZE=50000' >> /home/app/.bashrc && \
    echo 'export HISTFILESIZE=50000' >> /home/app/.bashrc && \
    echo 'shopt -s histappend' >> /home/app/.bashrc && \
    echo 'alias yolo="claude --dangerously-skip-permissions"' >> /home/app/.bashrc && \
    echo 'alias yolo-codex="codex --full-auto"' >> /home/app/.bashrc

RUN echo '# Terminal settings' >> /home/app/.zshrc && \
    echo 'export TERM=xterm-256color' >> /home/app/.zshrc && \
    echo '' >> /home/app/.zshrc && \
    echo '# History configuration' >> /home/app/.zshrc && \
    echo 'HISTFILE=~/.zsh_history' >> /home/app/.zshrc && \
    echo 'HISTSIZE=50000' >> /home/app/.zshrc && \
    echo 'SAVEHIST=50000' >> /home/app/.zshrc && \
    echo 'setopt APPEND_HISTORY' >> /home/app/.zshrc && \
    echo 'setopt SHARE_HISTORY' >> /home/app/.zshrc && \
    echo 'setopt HIST_IGNORE_DUPS' >> /home/app/.zshrc && \
    echo 'setopt HIST_FIND_NO_DUPS' >> /home/app/.zshrc && \
    echo '' >> /home/app/.zshrc && \
    echo '# Key bindings (vi mode with arrow keys)' >> /home/app/.zshrc && \
    echo 'bindkey -v' >> /home/app/.zshrc && \
    echo 'bindkey "^[[A" history-beginning-search-backward' >> /home/app/.zshrc && \
    echo 'bindkey "^[[B" history-beginning-search-forward' >> /home/app/.zshrc && \
    echo 'bindkey "^R" history-incremental-search-backward' >> /home/app/.zshrc && \
    echo '' >> /home/app/.zshrc && \
    echo '# Completion settings' >> /home/app/.zshrc && \
    echo 'autoload -Uz compinit && compinit' >> /home/app/.zshrc && \
    echo 'zstyle ":completion:*" matcher-list "m:{a-z}={A-Za-z}"' >> /home/app/.zshrc && \
    echo 'zstyle ":completion:*" menu select' >> /home/app/.zshrc && \
    echo '' >> /home/app/.zshrc && \
    echo '# Load syntax highlighting and autosuggestions' >> /home/app/.zshrc && \
    echo '[ -f /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ] && source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh' >> /home/app/.zshrc && \
    echo '[ -f /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh ] && source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh' >> /home/app/.zshrc && \
    echo '' >> /home/app/.zshrc && \
    echo '# Prompt' >> /home/app/.zshrc && \
    echo 'PROMPT="%F{cyan}%n@%m%f:%F{blue}%~%f$ "' >> /home/app/.zshrc && \
    echo '' >> /home/app/.zshrc && \
    echo '# Aliases' >> /home/app/.zshrc && \
    echo 'alias yolo="claude --dangerously-skip-permissions"' >> /home/app/.zshrc && \
    echo 'alias yolo-codex="codex --full-auto"' >> /home/app/.zshrc

# Agent CLIs.
ARG CLAUDE_CODE_VERSION=latest
RUN sudo npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Bump CODEX_CACHE_BUST to force a reinstall of the Codex CLI.
ARG CODEX_CACHE_BUST=2026-09-09
RUN sudo npm install -g @openai/codex

# Process management for the Studio server and the site.
RUN sudo npm install -g pm2

# cucumber-viz, the planning and implementation tool, from the private registry.
# Bump CUCUMBER_VIZ_VERSION to pick up a newly published version; the paths in
# .mcp.json, ecosystem.config.cjs and .devcontainer/codex-config.toml point at
# this global install.
ARG CUCUMBER_VIZ_VERSION=0.6.3
RUN sudo npm install -g --registry https://npm.braimax.com cucumber-viz@${CUCUMBER_VIZ_VERSION}

# Seed the container-local Codex config (auth.json is bind-mounted at runtime).
RUN mkdir -p /home/app/.codex
COPY --chown=app:app .devcontainer/codex-config.toml /home/app/.codex/config.toml

ENV NODE_ENV=development

# Chromium configuration for headless operation in the container.
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage --disable-gpu"

# Studio, site dev, site serve, example API, example Vite.
EXPOSE 4080 4300 4301 8787 5180

CMD ["/bin/zsh"]
