# 2026-04-18 09:09:03 by RouterOS 7.22.1
# software id = 0424-TNPI
#
# model = RB2011UiAS-2HnD
# serial number = B9080AEE3C73
/interface bridge
add disabled=yes name=B1
add name=bridge1
/interface ethernet
set [ find default-name=ether1 ] name=1-Iwana
set [ find default-name=ether2 ] name=2-Usuarios
set [ find default-name=sfp1 ] advertise=10M-baseT-half,10M-baseT-full,100M-baseT-half,100M-baseT-full,1G-baseT-half,1G-baseT-full
/interface wireless
# managed by CAPsMAN
set [ find default-name=wlan1 ] ssid=MikroTik
/interface list
add name=WAN
add name=LAN
/interface lte apn
set [ find default=yes ] ip-type=ipv4 use-network-apn=no
/interface wireless security-profiles
set [ find default=yes ] supplicant-identity=MikroTik
/ip firewall layer7-protocol
add name=youtube regexp="^.+(youtube.com|www.youtube.com|m.youtube.com|ytimg.com|s.ytimg.com|ytimg.l.google.com|youtube.l.google.com|i.google.com|googlevideo.com|youtu.be).*\$"
/ip pool
add name=dhcp_pool4 ranges=192.168.1.2-192.168.1.254
/ip dhcp-server
# DHCP server can not run on slave interface!
add address-pool=dhcp_pool4 interface=2-Usuarios name=dhcp1
/ip smb users
set [ find default=yes ] disabled=yes
/queue simple
add comment=Gobierno disabled=yes max-limit=10M/10M name=Gobierno target=192.168.1.8/32
add comment=Acuatena disabled=yes max-limit=10M/10M name=Acuatena target=192.168.1.9/32
add comment=Inspeccion disabled=yes max-limit=5M/5M name=Inspeccion target=192.168.1.10/32
add comment=Planeacion disabled=yes max-limit=30M/30M name=Planeacion target=192.168.1.11/32
add comment=Concejo disabled=yes max-limit=5M/5M name=Concejo target=192.168.1.14/32
add comment=Tesoreria disabled=yes max-limit=50M/50M name=Tesoreria target=192.168.1.15/32
add comment=Comisaria disabled=yes max-limit=5M/5M name=Comisaria target=192.168.1.16/32
add comment="Desarollo social" disabled=yes max-limit=10M/25M name="Desarrollo social" target=192.168.1.17/32
add disabled=yes max-limit=10M/10M name="EQUIPO 13" target=192.168.1.2/32
add disabled=yes max-limit=5M/10M name=ARCHER_C20 target=192.168.1.13/32
add disabled=yes name="SERVIDOR IMPRESORA" target=192.168.1.101/32
add disabled=yes max-limit=10M/10M name=TL-WR840N target=192.168.1.104/32
add disabled=yes max-limit=10M/10M name=Equipo3 target=192.168.1.106/32
add disabled=yes max-limit=10M/10M name=DESKTOP-76J733T target=192.168.1.108/32
add disabled=yes max-limit=10M/10M name=DESKTOP-KE41SPN2 target=192.168.1.107/32
add disabled=yes max-limit=50M/50M name=Equipo17 target=192.168.1.109/32
add disabled=yes max-limit=50M/50M name=EQUIPO7 target=192.168.1.110/32
add disabled=yes max-limit=50M/50M name=DESKTOP-M0Q27NS target=192.168.1.112/32
add disabled=yes max-limit=50M/50M name=DESKTOP-O053GFC target=192.168.1.114/32
add disabled=yes max-limit=50M/50M name=DESKTOP-CO6CJVA target=192.168.1.115/32
add disabled=yes max-limit=50M/50M name=DESKTOP-R5RIJ7D target=192.168.1.116/32
add disabled=yes max-limit=50M/50M name=ALT-CM-04 target=192.168.1.118/32
add disabled=yes max-limit=50M/50M name=JefeDes target=192.168.1.124/32
add disabled=yes max-limit=50M/50M name=DESKTOP-O01VI7M target=192.168.1.126/32
add disabled=yes max-limit=50M/50M name=SEC-PERSONERIA target=192.168.1.158/32
add disabled=yes max-limit=50M/50M name=08:40:F3:7D:0A:00 target=192.168.1.200/32
add disabled=yes max-limit=50M/50M name=Equipo9 target=192.168.1.123/32
add disabled=yes max-limit=50M/50M name=LAPTOP-NFEHOU0V target=192.168.1.122/32
add disabled=yes max-limit=50M/50M name=FamiliasTena target=192.168.1.121/32
add disabled=yes max-limit=50M/50M name=DESKTOP-KE41SPN target=192.168.1.120/32
add disabled=yes max-limit=50M/50M name=PIC target=192.168.1.119/32
add disabled=yes max-limit=50M/50M name=DESKTOP-JJNUL1P target=192.168.1.111/32
add disabled=yes max-limit=50M/50M name=DESKTOP-62OLA1F target=192.168.1.102/32
add max-limit=95M/95M name="Alcaldia Tena" queue=pcq-upload-default/pcq-download-default target=1-Iwana
/routing bgp template
set default disabled=no output.network=bgp-networks
/routing ospf instance
add disabled=no name=default-v2
/routing ospf area
add disabled=yes instance=default-v2 name=backbone-v2
/interface bridge port
add bridge=bridge1 interface=2-Usuarios
add bridge=bridge1 interface=ether3
add bridge=bridge1 interface=1-Iwana
add bridge=bridge1 interface=ether4
add bridge=bridge1 interface=ether5
add bridge=bridge1 interface=ether6
add bridge=bridge1 interface=ether7
add bridge=bridge1 interface=ether8
add bridge=bridge1 interface=ether9
add bridge=bridge1 interface=ether10
add bridge=bridge1 interface=sfp1
add bridge=bridge1 interface=wlan1
/ip firewall connection tracking
set udp-timeout=10s
/ip settings
set max-neighbor-entries=8192
/ipv6 settings
set allow-fast-path=no disable-ipv6=yes forward=no max-neighbor-entries=8192
/interface list member
add interface=1-Iwana list=LAN
add interface=2-Usuarios list=LAN
add interface=ether3 list=LAN
add interface=ether4 list=LAN
add interface=ether5 list=LAN
add interface=ether6 list=LAN
add interface=ether7 list=LAN
add interface=ether8 list=LAN
add interface=ether9 list=LAN
add interface=ether10 list=LAN
add interface=sfp1 list=LAN
add interface=1-Iwana list=WAN
add interface=wlan1 list=LAN
/interface ovpn-server server
add auth=sha1,md5 mac-address=FE:1A:37:99:2C:8A name=ovpn-server1
/interface wireless cap
# 
set bridge=bridge1 enabled=yes interfaces=wlan1
/ip address
add address=122.0.3.64/24 interface=1-Iwana network=122.0.3.0
add address=192.168.1.1/24 interface=2-Usuarios network=192.168.1.0
add address=10.0.0.250 disabled=yes interface=1-Iwana network=10.0.0.25
add address=181.225.107.244/8 interface=1-Iwana network=181.0.0.0
add address=122.0.1.100/8 interface=wlan1 network=122.0.0.0
/ip dhcp-server lease
add address=192.168.1.2 comment="Servidor de red" mac-address=40:A8:F0:A2:30:72
add address=192.168.1.17 comment="Desarrrollo social" mac-address=D4:6E:0E:A0:F4:2F
add address=192.168.1.8 comment=Gobierno mac-address=D8:0D:17:BA:89:33
add address=192.168.1.10 comment=Inspeccion mac-address=AC:84:C6:CD:38:C7
add address=192.168.1.11 comment=Planeacion mac-address=7C:8B:CA:52:F2:9B
add address=192.168.1.9 comment=Acuatena mac-address=64:66:B3:C7:11:52
add address=192.168.1.12 comment=Samade mac-address=D8:0D:17:BA:95:4F
add address=192.168.1.13 comment=Juzgado mac-address=50:C7:BF:D4:4E:A4
add address=192.168.1.16 comment=Comisaria mac-address=2C:4D:54:BB:FE:D7
add address=192.168.1.14 comment=Concejo mac-address=68:FF:7B:9F:DE:65
add address=192.168.1.15 comment=Tesoreria mac-address=D8:0D:17:BA:89:41
/ip dhcp-server network
add address=192.168.1.0/24 dns-none=yes gateway=192.168.1.1
/ip dns
set servers=8.8.8.8,1.1.1.1
/ip firewall address-list
add address=192.168.1.0/24 list="LAN Addresses (RFC1918)"
add address=8.8.8.8 comment=Google list="DNS Servers"
add address=8.8.4.4 comment=Google list="DNS Servers"
add address=4.2.2.1 comment="Level 3" list="DNS Servers"
add address=4.2.2.2 comment="Level 3" list="DNS Servers"
add address=208.67.222.222 comment=OpenDNS list="DNS Servers"
add address=208.67.220.220 comment=OpenDNS list="DNS Servers"
add address=1.1.1.1 comment=Cloudflare list="DNS Servers"
add address=1.0.0.1 comment=Cloudflare list="DNS Servers"
add address=4.2.2.3 comment="Level 3" list="DNS Servers"
add address=4.2.2.4 comment="Level 3" list="DNS Servers"
add address=4.2.2.5 comment="Level 3" list="DNS Servers"
add address=4.2.2.6 comment="Level 3" list="DNS Servers"
add address=45.90.28.225 comment=NextDNS list="DNS Servers"
add address=45.90.30.225 comment=NextDNS list="DNS Servers"
add address=948953.dns.nextdns.io comment=NextDNS list="DNS Servers"
add address=188.94.192.215 comment=FlastStart list="DNS Servers"
add address=45.76.84.187 comment=FlastStart list="DNS Servers"
add address=9.9.9.9 comment=Quad9 list="DNS Servers"
add address=149.112.112.112 comment=Quad9 list="DNS Servers"
/ip firewall filter
add action=drop chain=input comment="Drop Invalid connections" connection-state=invalid disabled=yes
add action=accept chain=input comment="Allow Established connections" connection-state=established disabled=yes
add action=accept chain=input comment="Allow ICMP" disabled=yes protocol=icmp
add action=jump chain=input comment="Jump to DNS_INPUT Chain" disabled=yes dst-port=53 jump-target=DNS_INPUT log=yes protocol=udp
add action=accept chain=DNS_INPUT comment="Make exceptions for LAN DNS inquiries" disabled=yes port=53 protocol=udp src-address-list="LAN Addresses (RFC1918)"
add action=add-src-to-address-list address-list=DNS_DDoS address-list-timeout=none-dynamic chain=DNS_INPUT comment="Add other DNS inquriries to DNS_DDoS Offenders List" disabled=yes port=53 protocol=udp \
    src-address-list="!LAN Addresses (RFC1918)"
add action=drop chain=DNS_INPUT comment="Drop Traffic Sourced from DNS_DDoS Offenders" disabled=yes src-address-list=DNS_DDoS
add action=return chain=DNS_INPUT comment="Return from DNS_INPUT Chain" disabled=yes
add action=drop chain=input comment="drop ssh brute forcers" disabled=yes dst-port=22 protocol=tcp src-address-list=ssh_blacklist
add action=add-src-to-address-list address-list=ssh_blacklist address-list-timeout=1w3d chain=input connection-state=new disabled=yes dst-port=22 protocol=tcp src-address-list=ssh_stage3
add action=add-src-to-address-list address-list=ssh_stage3 address-list-timeout=1m chain=input connection-state=new disabled=yes dst-port=22 protocol=tcp src-address-list=ssh_stage2
add action=add-src-to-address-list address-list=ssh_stage2 address-list-timeout=1m chain=input connection-state=new disabled=yes dst-port=22 protocol=tcp src-address-list=ssh_stage1
add action=add-src-to-address-list address-list=ssh_stage1 address-list-timeout=1m chain=input connection-state=new disabled=yes dst-port=22 protocol=tcp
add action=add-src-to-address-list address-list=Syn_Flooder address-list-timeout=30m chain=input comment="Add Syn Flood IP to the list" connection-limit=30,32 disabled=yes
add action=drop chain=input comment="Drop to syn flood list" disabled=yes src-address-list=Syn_Flooder
add action=add-src-to-address-list address-list=Port_Scanner address-list-timeout=1w chain=input comment="Port Scanner Detect" disabled=yes protocol=tcp psd=21,3s,3,1
add action=drop chain=input comment="Drop to port scan list" disabled=yes src-address-list=Port_Scanner
add action=accept chain=input comment="Allow ICMP" disabled=yes protocol=icmp
add action=drop chain=input comment="drop ftp brute forcers" disabled=yes dst-port=21 protocol=tcp src-address-list=ftp_blacklist
add action=drop chain=input comment="Drop everything else" disabled=yes
add action=accept chain=forward comment="Drop everything else" disabled=yes src-address=120.0.0.0/24
add action=jump chain=forward comment="Jump to DNS_FORWARD Chain" disabled=yes jump-target=DNS_FORWARD
add action=accept chain=DNS_FORWARD comment="Make Exceptions for Traffic from the DNS Servers going to the LAN" disabled=yes dst-address-list="LAN Addresses (RFC1918)" port=53 protocol=udp src-address-list=\
    "DNS Servers"
add action=accept chain=DNS_FORWARD comment="Make Exceptions for Traffic from the LAN going to the DNS Servers" disabled=yes dst-address-list="DNS Servers" port=53 protocol=udp src-address-list=\
    "LAN Addresses (RFC1918)"
add action=drop chain=DNS_FORWARD comment="Drop All Other DNS Traffic" disabled=yes port=53 protocol=udp
add action=drop chain=forward comment="Drop Traffic to DNS DNS_DDoS Offenders" disabled=yes dst-address-list=DNS_DDoS
add action=drop chain=forward comment="Avoid spammers action" disabled=yes dst-port=25 protocol=tcp src-address-list=spammers
add action=add-src-to-address-list address-list=spammers address-list-timeout=3h chain=forward disabled=yes dst-port=25,110,465 protocol=tcp
add action=jump chain=forward comment="Bloqueo DDOS" connection-state=new disabled=yes jump-target=detect-ddos
add action=return chain=detect-ddos disabled=yes dst-limit=32,32,src-and-dst-addresses/10s
add action=return chain=detect-ddos disabled=yes src-address=192.168.0.0/16
add action=add-dst-to-address-list address-list=ddosed address-list-timeout=10m chain=detect-ddos disabled=yes
add action=add-src-to-address-list address-list=ddoser address-list-timeout=10m chain=detect-ddos disabled=yes
add action=drop chain=forward connection-state=new disabled=yes dst-address-list=ddosed src-address-list=ddoser
add action=accept chain=forward comment="CLI Disctinctive" disabled=yes protocol=tcp tcp-flags=ack,!syn
add action=accept chain=forward connection-state=!related,new disabled=yes
add action=drop chain=forward disabled=yes src-address=0.0.0.0/8
add action=drop chain=forward disabled=yes dst-address=0.0.0.0/8
add action=drop chain=forward disabled=yes src-address=127.0.0.0/8
add action=drop chain=forward disabled=yes dst-address=127.0.0.0/8
add action=drop chain=forward disabled=yes src-address=224.0.0.0/3
add action=drop chain=forward disabled=yes dst-address=224.0.0.0/3
add action=jump chain=forward disabled=yes jump-target=tcp protocol=tcp
add action=jump chain=forward disabled=yes jump-target=udp protocol=udp
add action=jump chain=forward disabled=yes jump-target=icmp protocol=icmp
add action=accept chain=output comment="drop ftp brute forcers" content="530 Login incorrect" disabled=yes dst-limit=1/1m,9,dst-address/1m protocol=tcp
add action=add-dst-to-address-list address-list=ftp_blacklist address-list-timeout=3h chain=output content="530 Login incorrect" disabled=yes protocol=tcp
add action=jump chain=output comment="Jump to DNS_OUTPUT Chain" disabled=yes dst-port=53 jump-target=DNS_OUTPUT protocol=udp
add action=accept chain=DNS_OUTPUT comment="Make Exceptions for Traffic to the DNS Servers" disabled=yes dst-address-list="DNS Servers" dst-port=53 protocol=udp
add action=drop chain=DNS_OUTPUT comment="Drop All Other Out Bound DNS Traffic" disabled=yes dst-port=53 protocol=udp
add action=return chain=DNS_OUTPUT comment="Return from DNS_OUTPUT Chain" disabled=yes
add action=drop chain=tcp comment="deny RPC portmapper" disabled=yes dst-port=111 protocol=tcp
add action=drop chain=tcp comment="deny RPC portmapper" disabled=yes dst-port=135 protocol=tcp
add action=drop chain=tcp comment="deny TFTP" disabled=yes dst-port=69 protocol=tcp
add action=drop chain=tcp comment="deny NBT" disabled=yes dst-port=137-139 protocol=tcp
add action=drop chain=tcp comment="deny cifs" disabled=yes dst-port=445 protocol=tcp
add action=drop chain=tcp comment="deny NFS" disabled=yes dst-port=2049 protocol=tcp
add action=drop chain=tcp comment="deny NetBus" disabled=yes dst-port=12345-12346 protocol=tcp
add action=drop chain=tcp comment="deny NetBus" disabled=yes dst-port=20034 protocol=tcp
add action=drop chain=tcp comment="deny BackOriffice" disabled=yes dst-port=3133 protocol=tcp
add action=drop chain=tcp comment="deny DHCP" disabled=yes dst-port=67-68 protocol=tcp
add action=drop chain=udp comment="deny TFTP" disabled=yes dst-port=69 protocol=udp
add action=drop chain=udp comment="deny PRC portmapper" disabled=yes dst-port=111 protocol=udp
add action=drop chain=udp comment="deny PRC portmapper" disabled=yes dst-port=135 protocol=udp
add action=drop chain=udp comment="deny NBT" disabled=yes dst-port=137-139 protocol=udp
add action=drop chain=udp comment="deny NFS" disabled=yes dst-port=2049 protocol=udp
add action=accept chain=icmp comment="echo reply" disabled=yes icmp-options=0:0 protocol=icmp
add action=accept chain=icmp comment="net unreachable" disabled=yes icmp-options=3:0 protocol=icmp
add action=accept chain=icmp comment="host unreachable" disabled=yes icmp-options=3:1 protocol=icmp
add action=accept chain=icmp comment="host unreachable fragmentation required" disabled=yes icmp-options=3:4 protocol=icmp
add action=accept chain=icmp comment="allow echo request" disabled=yes icmp-options=8:0 protocol=icmp
add action=accept chain=icmp comment="allow time exceed" disabled=yes icmp-options=11:0 protocol=icmp
add action=accept chain=icmp comment="allow parameter bad" disabled=yes icmp-options=12:0 protocol=icmp
add action=drop chain=icmp comment="deny all other types" disabled=yes
/ip firewall nat
add action=masquerade chain=srcnat disabled=yes out-interface-list=WAN
/ip ipsec profile
set [ find default=yes ] dpd-interval=2m dpd-maximum-failures=5
/ip route
add check-gateway=ping disabled=no distance=2 dst-address=0.0.0.0/0 gateway=122.0.3.1 routing-table=main scope=30 target-scope=10
add check-gateway=ping disabled=no distance=1 dst-address=0.0.0.0/0 gateway=181.225.107.240 routing-table=main scope=30 target-scope=10
/ip service
set ftp disabled=yes
set telnet disabled=yes
set api-ssl disabled=yes
/lcd
set time-interval=weekly
/lcd interface pages
set 0 interfaces=sfp1,1-Iwana,2-Usuarios,ether3,ether4,ether5,ether6,ether7,ether8,ether9,ether10
/routing bfd configuration
add disabled=no interfaces=all min-rx=200ms min-tx=200ms multiplier=5
/system clock
set time-zone-name=America/Bogota
/system identity
set name="Alcaldia Tena"
/system ntp client
set enabled=yes
/system ntp client servers
add address=216.239.35.0
add address=216.239.35.4
