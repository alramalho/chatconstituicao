  
  My recommendation for a single Express API: go with the simple SSH + systemd + Caddy approach. It's:                                                                                                                   
  - Free, no overhead                                             
  - 5 minutes to set up                                                                                                                                                                                                  
  - Easy to understand and debug                                  
  - Caddy gives you auto-HTTPS with zero config                                                                                                                                                                          
                                                                                                                                                                                                                         
  Here's the plan:                                                                                                                                                                                                       
                                                                                                                                                                                                                         
  On your Hetzner server:                                                                                                                                                                                                
                                                                  
  # 1. Install Node 22                                                                                                                                                                                                   
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -                                                                                                                                                         
  sudo apt install -y nodejs                                                                                                                                                                                             
                                                                                                                                                                                                                         
  # 2. Install pnpm                                                                                                                                                                                                      
  npm i -g pnpm                                                   

  # 3. Install Caddy (reverse proxy + auto HTTPS)                                                                                                                                                                        
  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg                                                                         
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list                                                                                          
  sudo apt update && sudo apt install caddy                                                                                                                                                                              
                                                                                                                                                                                                                         
  # 4. Clone & build                                                                                                                                                                                                     
  cd /opt                                                                                                                                                                                                                
  sudo git clone <your-repo-url> chatconstituicao                                                                                                                                                                        
  cd chatconstituicao                                                                                                                                                                                                    
  pnpm install                                                                                                                                                                                                           
  pnpm build                                                                                                                                                                                                             
                                                                                                                                                                                                                         
  # 5. Create env file                                                                                                                                                                                                   
  sudo cp apps/api/.env.example apps/api/.env                                                                                                                                                                            
  sudo nano apps/api/.env  # fill in your real values                                                                                                                                                                    
                                                                                                                                                                                                                         
  Set FRONTEND_URL in .env to your frontend domain (e.g. https://chatconstituicao.pt).                                                                                                                                   
                                                                                                                                                                                                                         
  6. Create systemd service — /etc/systemd/system/chatconstituicao-api.service:                                                                                                                                          
  [Unit]                                                          
  Description=ChatConstituicao API                                                                                                                                                                                       
  After=network.target                                            
                                                                                                                                                                                                                         
  [Service]
  Type=simple                                                                                                                                                                                                            
  WorkingDirectory=/opt/chatconstituicao                          
  ExecStart=/usr/bin/node apps/api/dist/index.js                                                                                                                                                                         
  EnvironmentFile=/opt/chatconstituicao/apps/api/.env             
  Restart=always                                                                                                                                                                                                         
  RestartSec=5  
                                                                                                                                                                                                                         
  [Install]                                                       
  WantedBy=multi-user.target
                            
  sudo systemctl daemon-reload
  sudo systemctl enable --now chatconstituicao-api                                                                                                                                                                       
   
  7. Configure Caddy — /etc/caddy/Caddyfile:                                                                                                                                                                             
  api.chatconstituicao.pt {                                       
      reverse_proxy localhost:3088                                                                                                                                                                                       
  }                                                                                                                                                                                                                      
   
  sudo systemctl reload caddy                                                                                                                                                                                            
                                                                                                                                                                                                                         
  8. DNS — Point api.chatconstituicao.pt to your Hetzner server's IP with an A record. Caddy will automatically get an HTTPS certificate from Let's Encrypt.                                                             
                                                                                                                                                                                                                         
  To redeploy after changes:                                                                                                                                                                                             
                                                                  
  cd /opt/chatconstituicao                                                                                                                                                                                               
  sudo git pull                                                   
  pnpm install                                                                                                                                                                                                           
  pnpm build                                                                                                                                                                                                             
  sudo systemctl restart chatconstituicao-api