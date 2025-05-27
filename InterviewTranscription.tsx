import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useSession, signIn, signOut } from "next-auth/react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyACfI3ECYaRqt5NYu0Dv5wHSMgCXDtEEMA",
  authDomain: "founder-pilot.firebaseapp.com",
  projectId: "founder-pilot",
  storageBucket: "founder-pilot.firebasestorage.app",
  messagingSenderId: "749995643766",
  appId: "1:749995643766:web:2dbe07cdaf595ab3892057",
  measurementId: "G-0V7W54G3PF"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function InterviewTranscription() {
  const { data: session } = useSession();
  const [audioFile, setAudioFile] = useState(null);
  const [transcription, setTranscription] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisReport, setAnalysisReport] = useState("");
  const [history, setHistory] = useState([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    if (session?.user?.email) fetchHistory();
  }, [session]);

  const fetchHistory = async () => {
    const q = query(collection(db, "interviews"), where("user", "==", session.user.email));
    const querySnapshot = await getDocs(q);
    const records = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setHistory(records.reverse());
  };

  const handleFileChange = (e) => {
    setAudioFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!audioFile || !session?.user?.email) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("audio", audioFile);

    try {
      const uploadRes = await fetch("/api/xfyun-upload", {
        method: "POST",
        body: formData,
      });
      const { taskId } = await uploadRes.json();

      let resultText = "";
      for (let i = 0; i < 20; i++) {
        const res = await fetch("/api/xfyun-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        });
        const data = await res.json();
        if (data.status === 4 && data.text) {
          resultText = data.text;
          break;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (!resultText) {
        setTranscription("识别超时，请稍后重试。");
        setLoading(false);
        return;
      }

      setTranscription(resultText);

      const analysisRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: resultText }),
      });
      const analysisData = await analysisRes.json();
      setAnalysisReport(analysisData.report);

      await addDoc(collection(db, "interviews"), {
        user: session.user.email,
        created_at: new Date().toISOString(),
        transcript: resultText,
        analysis: analysisData.report
      });

      fetchHistory();
    } catch (e) {
      console.error(e);
      setTranscription("识别失败，请检查音频文件或稍后重试。");
    }

    setLoading(false);
  };

  const exportPDF = () => {
    const content = `识别内容：\n${transcription}\n\n分析报告：\n${analysisReport}`;
    const blob = new Blob([content], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview_report.pdf";
    a.click();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        {!session ? (
          <Button onClick={() => signIn("google")}>使用 Google 登录</Button>
        ) : (
          <div className="flex justify-between w-full mb-2">
            <p className="text-sm text-muted-foreground">你好，{session.user.name}</p>
            <Button variant="ghost" onClick={() => signOut()}>登出</Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-semibold">上传用户访谈音频</h2>
          <Input type="file" accept="audio/*" onChange={handleFileChange} />
          <Button onClick={handleUpload} disabled={loading} className="w-full md:w-auto">
            {loading ? "识别与分析中..." : "上传并自动分析"}
          </Button>
        </CardContent>
      </Card>

      {transcription && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-semibold">识别结果</h2>
            <Textarea rows={isMobile ? 6 : 12} value={transcription} readOnly />
          </CardContent>
        </Card>
      )}

      {analysisReport && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-semibold">分析报告</h2>
            <Textarea rows={isMobile ? 6 : 12} value={analysisReport} readOnly />
            <Button onClick={exportPDF} className="w-full md:w-auto">导出为 PDF</Button>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-semibold">历史访谈记录</h2>
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id} className="border rounded p-2">
                  <strong>记录时间：</strong> {new Date(item.created_at).toLocaleString()}<br />
                  <strong>摘要：</strong> {item.transcript.slice(0, 40)}...<br />
                  <Button
                    className="mt-2 w-full md:w-auto"
                    onClick={() => {
                      setTranscription(item.transcript);
                      setAnalysisReport(item.analysis);
                    }}
                  >查看</Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
