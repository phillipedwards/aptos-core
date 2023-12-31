// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0
use crate::{RemoteKVRequest, RemoteKVResponse};
use aptos_secure_net::network_controller::{Message, NetworkController};
use crossbeam_channel::{Receiver, Sender};
use std::{
    net::SocketAddr,
    sync::{Arc, RwLock},
};

extern crate itertools;
use aptos_logger::trace;
use aptos_state_view::{StateView, TStateView};
use itertools::Itertools;

pub struct RemoteStateViewService<S: StateView + Sync + Send + 'static> {
    kv_rx: Receiver<Message>,
    kv_tx: Arc<Vec<Sender<Message>>>,
    thread_pool: Arc<rayon::ThreadPool>,
    state_view: Arc<RwLock<Option<Arc<S>>>>,
}

impl<S: StateView + Sync + Send + 'static> RemoteStateViewService<S> {
    pub fn new(
        controller: &mut NetworkController,
        remote_shard_addresses: Vec<SocketAddr>,
        num_threads: Option<usize>,
    ) -> Self {
        let num_threads = num_threads.unwrap_or_else(num_cpus::get);
        let thread_pool = Arc::new(
            rayon::ThreadPoolBuilder::new()
                .num_threads(num_threads)
                .build()
                .unwrap(),
        );
        let kv_request_type = "remote_kv_request";
        let kv_response_type = "remote_kv_response";
        let result_rx = controller.create_inbound_channel(kv_request_type.to_string());
        let command_txs = remote_shard_addresses
            .iter()
            .map(|address| {
                controller.create_outbound_channel(*address, kv_response_type.to_string())
            })
            .collect_vec();
        Self {
            kv_rx: result_rx,
            kv_tx: Arc::new(command_txs),
            thread_pool,
            state_view: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_state_view(&self, state_view: Arc<S>) {
        let mut state_view_lock = self.state_view.write().unwrap();
        *state_view_lock = Some(state_view);
    }

    pub fn start(&self) {
        loop {
            let message = self.kv_rx.recv().unwrap();
            let state_view = self.state_view.clone();
            let kv_txs = self.kv_tx.clone();
            self.thread_pool.spawn(move || {
                Self::handle_message(message, state_view, kv_txs);
            });
        }
    }

    pub fn handle_message(
        message: Message,
        state_view: Arc<RwLock<Option<Arc<S>>>>,
        kv_tx: Arc<Vec<Sender<Message>>>,
    ) {
        let req: RemoteKVRequest = bcs::from_bytes(&message.data).unwrap();
        let (shard_id, state_keys) = req.into();
        trace!(
            "remote state view service - received request for shard {} with {} keys",
            shard_id,
            state_keys.len()
        );
        let resp = state_keys
            .into_iter()
            .map(|state_key| {
                let state_value = state_view
                    .read()
                    .unwrap()
                    .as_ref()
                    .unwrap()
                    .get_state_value(&state_key)
                    .unwrap();
                (state_key, state_value)
            })
            .collect_vec();
        let len = resp.len();
        let resp = RemoteKVResponse::new(resp);
        let resp = bcs::to_bytes(&resp).unwrap();
        trace!(
            "remote state view service - sending response for shard {} with {} keys",
            shard_id,
            len
        );
        let message = Message::new(resp);
        kv_tx[shard_id].send(message).unwrap();
    }
}
