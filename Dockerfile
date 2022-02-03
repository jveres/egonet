# Make sure $DENO_DIR/dl/{release}/{version}/denort-x86_64-unknown-linux-gnu.zip is stripped

FROM ubuntu:20.04
RUN apt-get update && apt-get -y install binutils

COPY dist/egonet-x86_64-unknown-linux-gnu /egonet

RUN mkdir -p /rootfs
RUN ldd /egonet \
    /lib/x86_64-linux-gnu/libnss_files.so.* \
    /lib/x86_64-linux-gnu/libnss_dns.so.* \
    | grep -o -e '\/\(usr\|lib\)[^ :]\+' \
    | sort -u | tee /rootfs.list

#RUN cat /rootfs.list | grep -v '/egonet' | xargs strip
RUN echo /egonet >> /rootfs.list
RUN echo 'hosts: files dns' > /etc/nsswitch.conf
RUN echo /etc/nsswitch.conf >> /rootfs.list
RUN cat /rootfs.list | tar -T- -cphf- | tar -C /rootfs -xpf-

FROM scratch
COPY --from=0 /rootfs/ /
COPY webui /webui
EXPOSE 8080
CMD ["/egonet"]
